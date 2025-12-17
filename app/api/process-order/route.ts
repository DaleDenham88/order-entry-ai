// app/api/process-order/route.ts

import { NextRequest, NextResponse } from 'next/server';
import {
  parseOrderRequest,
  generateClarifyingQuestions,
  buildLineItem,
  detectUserIntent,
  answerDirectQuestion,
  extractInfoFromResponse
} from '@/lib/ai-assistant';
import { getProduct, getConfigurationAndPricing, getAvailableCharges } from '@/lib/promostandards';
import { ConversationState, GenerateLineItemResponse, ParsedOrderRequest } from '@/types';

export async function POST(request: NextRequest): Promise<NextResponse<GenerateLineItemResponse>> {
  try {
    const body = await request.json();
    const { userInput, currentState } = body as {
      userInput: string;
      currentState?: ConversationState;
    };

    // Initialize state - preserve everything from previous state
    let state: ConversationState = currentState || {
      step: 'initial',
      parsedRequest: { rawQuery: '', confidence: 'low', missingFields: [] },
      selectedOptions: {},
      questions: [],
    };

    // Detect what the user is trying to do
    const intent = await detectUserIntent(userInput, state);

    // Handle direct questions (e.g., "what decoration methods are available?")
    if (intent.type === 'question') {
      const answer = await answerDirectQuestion(userInput, state);
      return NextResponse.json({
        success: true,
        state,
        message: answer
      });
    }

    // Extract any new information from user's response
    const extractedInfo = await extractInfoFromResponse(userInput, state);

    // Merge extracted info into parsedRequest (never overwrite with null/undefined)
    state.parsedRequest = mergeInfo(state.parsedRequest, extractedInfo);

    // Also update selectedOptions for any newly extracted fields
    const validKeys = ['productId', 'quantity', 'color', 'size', 'decorationMethod', 'decorationColors', 'decorationLocation'];
    validKeys.forEach(key => {
      const value = extractedInfo[key as keyof typeof extractedInfo];
      if (value !== null && value !== undefined) {
        state.selectedOptions[key] = value as string | number;
      }
    });

    // If we don't have a product yet, try to get one
    if (!state.product && state.parsedRequest.productId) {
      const product = await getProduct(state.parsedRequest.productId);
      if (product) {
        state.product = product;
        state.step = 'product_found';

        // Fetch pricing
        const pricing = await getConfigurationAndPricing(product.productId);
        if (pricing) {
          const charges = await getAvailableCharges(product.productId);
          pricing.charges = charges;
          state.pricing = pricing;
        }
      } else {
        // Product not found
        state.questions = [{
          field: 'productId',
          question: `I couldn't find product "${state.parsedRequest.productId}" in the HIT catalog. Please check the product ID and try again.`,
          type: 'text',
          options: undefined,
        }];
        return NextResponse.json({
          success: true,
          state,
          message: state.questions[0].question
        });
      }
    }

    // If we still don't have a product ID at all, ask for it
    if (!state.parsedRequest.productId) {
      state.step = 'clarifying_product';
      state.questions = [{
        field: 'productId',
        question: "What's the product ID or SKU? (e.g., '550075' or '16103')",
        type: 'text',
        options: undefined,
      }];
      return NextResponse.json({
        success: true,
        state,
        message: "I'd be happy to help with your order! " + state.questions[0].question
      });
    }

    // We have product and pricing - check what's still missing
    if (state.product && state.pricing) {
      // Calculate what we still need
      const questions = await generateClarifyingQuestions(
        state.parsedRequest,
        state.product,
        state.pricing,
        state.selectedOptions
      );

      if (questions.length > 0) {
        state.step = 'clarifying_options';
        state.questions = questions;

        // Build a natural response acknowledging what we know
        const acknowledgment = buildAcknowledgment(state.parsedRequest, state.selectedOptions);
        const message = acknowledgment
          ? `${acknowledgment}\n\n${questions[0].question}`
          : questions[0].question;

        return NextResponse.json({ success: true, state, message });
      }

      // We have everything - build the line item
      state.step = 'calculating_price';
      const lineItem = await buildLineItem(
        state.parsedRequest,
        state.product,
        state.pricing,
        state.selectedOptions
      );

      state.lineItem = lineItem;
      state.step = 'complete';
      state.questions = [];

      const message = `Here's your line item for ${lineItem.quantity}x ${lineItem.productName} in ${lineItem.color}:

**Product:** ${lineItem.productId} - ${lineItem.partId}
**Unit Price:** $${lineItem.unitPrice.toFixed(2)}
**Extended:** $${lineItem.extendedPrice.toFixed(2)}
${lineItem.charges.length > 0 ? `\n**Decoration Charges:**\n${lineItem.charges.map(c => `- ${c.name}: $${c.extendedPrice.toFixed(2)}`).join('\n')}` : ''}
**Total:** $${lineItem.totalWithCharges.toFixed(2)}
${lineItem.fobPoint ? `\n*Ships from: ${lineItem.fobPoint}*` : ''}`;

      return NextResponse.json({ success: true, state, message });
    }

    // Fallback - shouldn't normally reach here
    return NextResponse.json({
      success: true,
      state,
      message: "I'm having trouble processing that. Could you provide the product ID you're looking for?"
    });

  } catch (error) {
    console.error('Process order error:', error);
    return NextResponse.json({
      success: false,
      state: {
        step: 'initial',
        parsedRequest: { rawQuery: '', confidence: 'low', missingFields: [] },
        selectedOptions: {},
        questions: [],
      },
      message: 'An error occurred processing your request.',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// Merge new info into existing, never overwriting with null/undefined
function mergeInfo(existing: ParsedOrderRequest, newInfo: Partial<ParsedOrderRequest>): ParsedOrderRequest {
  const merged = { ...existing };

  Object.entries(newInfo).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      (merged as Record<string, unknown>)[key] = value;
    }
  });

  return merged;
}

// Build acknowledgment of what we know
function buildAcknowledgment(parsed: ParsedOrderRequest, selected: Record<string, string | number>): string {
  const known: string[] = [];

  if (parsed.quantity || selected.quantity) {
    known.push(`${parsed.quantity || selected.quantity} units`);
  }
  if (parsed.color || selected.color) {
    known.push(`color: ${parsed.color || selected.color}`);
  }
  if (parsed.decorationMethod || selected.decorationMethod) {
    known.push(`decoration: ${parsed.decorationMethod || selected.decorationMethod}`);
  }

  if (known.length === 0) return '';
  return `Got it - ${known.join(', ')}.`;
}
