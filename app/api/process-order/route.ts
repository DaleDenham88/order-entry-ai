// app/api/process-order/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { 
  parseOrderRequest, 
  generateClarifyingQuestions, 
  buildLineItem,
  generateResponseMessage 
} from '@/lib/ai-assistant';
import { getProduct, getConfigurationAndPricing, getAvailableCharges, getAvailableLocations } from '@/lib/promostandards';
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

    // If we have a current state with questions, this is an answer
    if (currentState && currentState.questions.length > 0 && userInput) {
      const lastQuestion = state.questions[0];
      
      // Store the answer
      if (lastQuestion.field === 'quantity') {
        const qty = parseInt(userInput);
        if (!isNaN(qty)) {
          state.selectedOptions.quantity = qty;
          state.parsedRequest.quantity = qty;
        }
      } else if (lastQuestion.field === 'color') {
        state.selectedOptions.color = userInput;
        state.parsedRequest.color = userInput;
      } else if (lastQuestion.field === 'decorationMethod') {
        state.selectedOptions.decorationMethod = userInput;
        state.parsedRequest.decorationMethod = userInput;
      } else if (lastQuestion.field === 'decorationLocation') {
        state.selectedOptions.decorationLocation = userInput;
        state.parsedRequest.decorationLocation = userInput;
      } else if (lastQuestion.field === 'decorationColors') {
        const colors = parseInt(userInput);
        if (!isNaN(colors)) {
          state.selectedOptions.decorationColors = colors;
          state.parsedRequest.decorationColors = colors;
        }
      } else if (lastQuestion.field === 'productId') {
        state.parsedRequest.productId = userInput;
      } else {
        // Generic field
        state.selectedOptions[lastQuestion.field] = userInput;
      }
      
      // Clear the answered question
      state.questions = state.questions.slice(1);
    }

    // Step 1: Parse the user input if this is initial or we need product
    if (state.step === 'initial' || !state.product) {
      // Only parse if we don't already have parsed data
      if (!state.parsedRequest.productId) {
        const parsed = await parseOrderRequest(userInput);
        state.parsedRequest = { ...state.parsedRequest, ...parsed };
      }

      // If we don't have a product ID, we need to ask
      if (!state.parsedRequest.productId) {
        state.step = 'clarifying_product';
        state.questions = [{
          field: 'productId',
          question: "I need a product ID to look up. What's the product number? (e.g., '5790' for HIT drinkware)",
          type: 'text',
          options: undefined,
        }];
        
        return NextResponse.json({ 
          success: true, 
          state, 
          message: "I'd be happy to help build your order! What's the product ID or SKU you're looking for?" 
        });
      }

      // Fetch product data
      const product = await getProduct(state.parsedRequest.productId);
      if (!product) {
        state.questions = [{
          field: 'productId',
          question: `Couldn't find product "${state.parsedRequest.productId}". Please check the ID and try again.`,
          type: 'text',
          options: undefined,
        }];
        return NextResponse.json({ 
          success: true, 
          state, 
          message: `I couldn't find product "${state.parsedRequest.productId}" in HIT's catalog. Double-check the product ID?`
        });
      }

      state.product = product;
      state.step = 'product_found';

      // Fetch pricing and configuration
      const pricing = await getConfigurationAndPricing(product.productId);
      if (pricing) {
        // Fetch additional data
        const [charges, locations] = await Promise.all([
          getAvailableCharges(product.productId),
          getAvailableLocations(product.productId),
        ]);
        
        pricing.charges = charges;
        if (locations.length > 0) {
          pricing.decorationLocations = locations;
        }
        state.pricing = pricing;
      }
    }

    // Step 2: Generate clarifying questions if we have product but missing info
    if (state.product && state.pricing) {
      const questions = await generateClarifyingQuestions(
        state.parsedRequest,
        state.product,
        state.pricing
      );

      if (questions.length > 0) {
        const isFirstTime = state.step === 'product_found';
        state.step = 'clarifying_options';
        state.questions = questions;

        // Build a friendly message
        const productInfo = `Found **${state.product.productName}** (${state.product.productId})`;
        const questionText = questions.map(q => q.question).join('\n\n');

        return NextResponse.json({
          success: true,
          state,
          message: isFirstTime
            ? `${productInfo}\n\nI need a few details to complete your line item:\n\n${questionText}`
            : questionText
        });
      }

      // Step 3: We have enough info - build the line item
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

      return NextResponse.json({ 
        success: true, 
        state, 
        message: `Here's your complete line item for **${state.product.productName}**:`
      });
    }

    // Fallback
    return NextResponse.json({ 
      success: true, 
      state, 
      message: 'Something went wrong. Please try starting over with a product ID.'
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
      message: 'An error occurred. Please try again.',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
