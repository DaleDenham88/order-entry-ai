// app/api/process-order/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { 
  parseOrderRequest, 
  generateClarifyingQuestions, 
  buildLineItem,
  generateResponseMessage 
} from '@/lib/ai-assistant';
import { getProduct, getConfigurationAndPricing, getAvailableCharges } from '@/lib/promostandards';
import { ConversationState, GenerateLineItemResponse } from '@/types';

export async function POST(request: NextRequest): Promise<NextResponse<GenerateLineItemResponse>> {
  try {
    const body = await request.json();
    const { userInput, currentState } = body as {
      userInput: string;
      currentState?: ConversationState;
    };

    // Initialize or update state
    let state: ConversationState = currentState || {
      step: 'initial',
      parsedRequest: { rawQuery: '', confidence: 'low', missingFields: [] },
      selectedOptions: {},
      questions: [],
    };

    // Step 1: Parse the user input
    if (state.step === 'initial' || !state.product) {
      const parsed = await parseOrderRequest(userInput);
      state.parsedRequest = parsed;

      // If we don't have a product ID, we need to ask
      if (!parsed.productId) {
        state.step = 'clarifying_product';
        state.questions = [{
          field: 'productId',
          question: "I need a product ID or SKU to look up the item. What's the product number? (e.g., '5790' for HIT drinkware)",
          type: 'text',
          options: undefined,
        }];
        
        const message = await generateResponseMessage(state);
        return NextResponse.json({ success: true, state, message });
      }

      // Fetch product data
      const product = await getProduct(parsed.productId);
      if (!product) {
        state.questions = [{
          field: 'productId',
          question: `I couldn't find product "${parsed.productId}". Please check the product ID and try again.`,
          type: 'text',
          options: undefined,
        }];
        const message = await generateResponseMessage(state);
        return NextResponse.json({ success: true, state, message });
      }

      state.product = product;
      state.step = 'product_found';

      // Fetch pricing
      const pricing = await getConfigurationAndPricing(product.productId);
      if (pricing) {
        // Also fetch charges
        const charges = await getAvailableCharges(product.productId);
        pricing.charges = charges;
        state.pricing = pricing;
      }
    }

    // Step 2: Handle answers to clarifying questions
    if (currentState && userInput) {
      // User is answering a question
      const lastQuestion = state.questions[0];
      if (lastQuestion) {
        state.selectedOptions[lastQuestion.field] = userInput;
        
        // Update parsed request if it's a core field
        if (lastQuestion.field === 'quantity') {
          state.parsedRequest.quantity = parseInt(userInput);
        } else if (lastQuestion.field === 'color') {
          state.parsedRequest.color = userInput;
        } else if (lastQuestion.field === 'productId') {
          state.parsedRequest.productId = userInput;
          // Fetch the product
          const product = await getProduct(userInput);
          if (product) {
            state.product = product;
            const pricing = await getConfigurationAndPricing(product.productId);
            if (pricing) {
              const charges = await getAvailableCharges(product.productId);
              pricing.charges = charges;
              state.pricing = pricing;
            }
          }
        }
      }
    }

    // Step 3: Generate clarifying questions if needed
    if (state.product && state.pricing) {
      const questions = await generateClarifyingQuestions(
        state.parsedRequest,
        state.product,
        state.pricing
      );

      if (questions.length > 0) {
        state.step = 'clarifying_options';
        state.questions = questions;
        const message = await generateResponseMessage(state);
        return NextResponse.json({ success: true, state, message });
      }

      // Step 4: We have enough info - build the line item
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

      const message = `Got it! Here's your line item for ${lineItem.quantity}x ${lineItem.productName} in ${lineItem.color}:

**Product:** ${lineItem.productId} - ${lineItem.partId}
**Unit Price:** $${lineItem.unitPrice.toFixed(2)}
**Extended:** $${lineItem.extendedPrice.toFixed(2)}
${lineItem.charges.length > 0 ? `\n**Decoration Charges:**\n${lineItem.charges.map(c => `- ${c.name}: $${c.extendedPrice.toFixed(2)}`).join('\n')}` : ''}
**Total:** $${lineItem.totalWithCharges.toFixed(2)}
${lineItem.fobPoint ? `\n*Ships from: ${lineItem.fobPoint}*` : ''}`;

      return NextResponse.json({ success: true, state, message });
    }

    // Fallback
    const message = await generateResponseMessage(state);
    return NextResponse.json({ success: true, state, message });

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
