// lib/ai-assistant.ts

import Anthropic from '@anthropic-ai/sdk';
import {
  ParsedOrderRequest,
  ConversationState,
  ClarifyingQuestion,
  OrderLineItem,
  Product,
  ProductPricing,
  LineItemCharge
} from '@/types';

const anthropic = new Anthropic();

// ============ DETECT USER INTENT ============

export async function detectUserIntent(
  userInput: string,
  state: ConversationState
): Promise<{ type: 'question' | 'answer' | 'order'; topic?: string }> {
  // Quick pattern matching for common question patterns
  const questionPatterns = [
    /what\s+(decoration\s+)?methods/i,
    /what\s+(are\s+)?(the\s+)?options/i,
    /what\s+colors/i,
    /what\s+sizes/i,
    /how\s+(much|many)/i,
    /can\s+(you|i)/i,
    /is\s+there/i,
    /do\s+you\s+have/i,
    /tell\s+me\s+about/i,
    /list\s+(the|all)/i,
  ];

  for (const pattern of questionPatterns) {
    if (pattern.test(userInput)) {
      return { type: 'question' };
    }
  }

  // If it's a short response and we have pending questions, it's likely an answer
  if (state.questions.length > 0 && userInput.split(' ').length <= 10) {
    return { type: 'answer' };
  }

  // Default to order intent
  return { type: 'order' };
}

// ============ ANSWER DIRECT QUESTIONS ============

export async function answerDirectQuestion(
  userInput: string,
  state: ConversationState
): Promise<string> {
  // Get available options from state
  const availableMethods = state.pricing?.decorationLocations
    .flatMap(l => l.decorationMethods.map(m => m.decorationName)) || [];
  const uniqueMethods = [...new Set(availableMethods)];

  const availableColors = state.product?.parts
    .flatMap(p => p.colors) || [];
  const uniqueColors = [...new Set(availableColors)];

  const availableLocations = state.pricing?.decorationLocations
    .map(l => l.locationName) || [];

  // Build context for the AI
  const context = `
Product: ${state.product?.productName || 'Not yet selected'}
Available decoration methods: ${uniqueMethods.length > 0 ? uniqueMethods.join(', ') : 'None listed'}
Available colors: ${uniqueColors.slice(0, 20).join(', ')}${uniqueColors.length > 20 ? ` (+${uniqueColors.length - 20} more)` : ''}
Available decoration locations: ${availableLocations.join(', ') || 'None listed'}
`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `You are a helpful order entry assistant. The user asked a direct question. Answer it concisely using the available information, then ask if they'd like to proceed with their order.

User question: "${userInput}"

Available information:
${context}

Rules:
- Answer the question directly and specifically
- List actual options when asked about methods, colors, etc.
- Keep response under 100 words
- Don't ask redundant questions
- If we don't have product info yet, mention that we need a product ID first

Respond naturally:`
      }
    ],
  });

  const content = message.content[0];
  if (content.type === 'text') {
    return content.text;
  }
  return "I'm not sure how to answer that. Could you rephrase?";
}

// ============ EXTRACT INFO FROM USER RESPONSE ============

export async function extractInfoFromResponse(
  userInput: string,
  state: ConversationState
): Promise<Partial<ParsedOrderRequest>> {
  // Get context about what we're asking for
  const currentQuestion = state.questions[0];
  const availableColors = state.product?.parts.flatMap(p => p.colors) || [];
  const availableMethods = state.pricing?.decorationLocations
    .flatMap(l => l.decorationMethods.map(m => m.decorationName)) || [];

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `Extract order information from the user's response. Be thorough - extract ALL information provided, not just what was asked for.

User response: "${userInput}"

Current question being asked: ${currentQuestion?.question || 'Initial order request'}
Current question field: ${currentQuestion?.field || 'general'}

Available colors: ${availableColors.slice(0, 30).join(', ')}
Available decoration methods: ${[...new Set(availableMethods)].join(', ')}

What we already know:
- Product ID: ${state.parsedRequest.productId || 'unknown'}
- Quantity: ${state.parsedRequest.quantity || 'unknown'}
- Color: ${state.parsedRequest.color || 'unknown'}
- Decoration Method: ${state.parsedRequest.decorationMethod || 'unknown'}
- Decoration Colors: ${state.parsedRequest.decorationColors || 'unknown'}
- Decoration Location: ${state.parsedRequest.decorationLocation || 'unknown'}

Extract ANY new information from the user's response. Match colors and methods to available options when possible.

Respond ONLY with valid JSON (no markdown):
{
  "productId": "string or null if not mentioned",
  "quantity": "number or null if not mentioned",
  "color": "string or null if not mentioned",
  "decorationMethod": "string or null if not mentioned",
  "decorationColors": "number or null if not mentioned",
  "decorationLocation": "string or null if not mentioned"
}`
      }
    ],
  });

  try {
    const content = message.content[0];
    if (content.type === 'text') {
      const parsed = JSON.parse(content.text.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
      // Convert string "null" to actual null, and parse numbers
      const result: Partial<ParsedOrderRequest> = {};

      if (parsed.productId && parsed.productId !== 'null') {
        result.productId = parsed.productId;
      }
      if (parsed.quantity && parsed.quantity !== 'null') {
        result.quantity = typeof parsed.quantity === 'number' ? parsed.quantity : parseInt(parsed.quantity);
      }
      if (parsed.color && parsed.color !== 'null') {
        result.color = parsed.color;
      }
      if (parsed.decorationMethod && parsed.decorationMethod !== 'null') {
        result.decorationMethod = parsed.decorationMethod;
      }
      if (parsed.decorationColors && parsed.decorationColors !== 'null') {
        result.decorationColors = typeof parsed.decorationColors === 'number' ? parsed.decorationColors : parseInt(parsed.decorationColors);
      }
      if (parsed.decorationLocation && parsed.decorationLocation !== 'null') {
        result.decorationLocation = parsed.decorationLocation;
      }

      return result;
    }
  } catch (e) {
    console.error('Failed to extract info:', e);
  }

  return {};
}

// ============ PARSE INITIAL REQUEST ============

export async function parseOrderRequest(userInput: string): Promise<ParsedOrderRequest> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `You are an order entry assistant for promotional products. Parse the following request and extract any information you can identify.

User request: "${userInput}"

Extract these fields if mentioned (leave null if not specified):
- productId: The supplier's product ID/SKU (e.g., "5790", "G500", "PC54", "550075")
- quantity: Number of items requested
- color: Color requested (e.g., "royal blue", "black", "white")
- size: Size requested (for apparel)
- decorationMethod: Screen print, embroidery, laser engraving, pad print, etc.
- decorationColors: Number of imprint colors
- decorationLocation: Where the decoration goes (front, back, left chest, etc.)
- supplierName: If they mention a specific supplier

Also assess:
- confidence: "high" if you have productId and quantity, "medium" if you have partial info, "low" if very vague
- missingFields: List fields that would be essential but are missing

Respond ONLY with valid JSON, no markdown:
{
  "productId": "string or null",
  "quantity": "number or null",
  "color": "string or null",
  "size": "string or null",
  "decorationMethod": "string or null",
  "decorationColors": "number or null",
  "decorationLocation": "string or null",
  "supplierName": "string or null",
  "confidence": "high|medium|low",
  "missingFields": ["array", "of", "strings"]
}`
      }
    ],
  });

  try {
    const content = message.content[0];
    if (content.type === 'text') {
      const parsed = JSON.parse(content.text.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
      return {
        ...parsed,
        rawQuery: userInput,
        productId: parsed.productId !== 'null' ? parsed.productId : undefined,
        quantity: parsed.quantity && parsed.quantity !== 'null' ? parseInt(parsed.quantity) : undefined,
        color: parsed.color !== 'null' ? parsed.color : undefined,
        decorationMethod: parsed.decorationMethod !== 'null' ? parsed.decorationMethod : undefined,
        decorationColors: parsed.decorationColors && parsed.decorationColors !== 'null' ? parseInt(parsed.decorationColors) : undefined,
        decorationLocation: parsed.decorationLocation !== 'null' ? parsed.decorationLocation : undefined,
      };
    }
  } catch (e) {
    console.error('Failed to parse AI response:', e);
  }

  return {
    rawQuery: userInput,
    confidence: 'low',
    missingFields: ['productId', 'quantity'],
  };
}

// ============ GENERATE CLARIFYING QUESTIONS ============

export async function generateClarifyingQuestions(
  parsedRequest: ParsedOrderRequest,
  product: Product,
  pricing: ProductPricing,
  selectedOptions: Record<string, string | number>
): Promise<ClarifyingQuestion[]> {
  // Combine parsed request and selected options to see what we have
  const known = {
    quantity: parsedRequest.quantity || selectedOptions.quantity,
    color: parsedRequest.color || selectedOptions.color,
    decorationMethod: parsedRequest.decorationMethod || selectedOptions.decorationMethod,
    decorationColors: parsedRequest.decorationColors || selectedOptions.decorationColors,
    decorationLocation: parsedRequest.decorationLocation || selectedOptions.decorationLocation,
  };

  // Build available options
  const availableColors = [...new Set(product.parts.flatMap(p => p.colors))];
  const availableLocations = pricing.decorationLocations.map(l => l.locationName);
  const availableMethods = [...new Set(pricing.decorationLocations.flatMap(l => l.decorationMethods.map(m => m.decorationName)))];

  // Determine what we still need
  const questions: ClarifyingQuestion[] = [];

  // Must have quantity
  if (!known.quantity) {
    questions.push({
      field: 'quantity',
      question: 'How many units do you need?',
      type: 'number',
      options: undefined,
    });
  }

  // Must have color if multiple available
  if (!known.color && availableColors.length > 1) {
    questions.push({
      field: 'color',
      question: `What color? Available: ${availableColors.slice(0, 8).join(', ')}${availableColors.length > 8 ? '...' : ''}`,
      type: 'select',
      options: availableColors.slice(0, 10),
    });
  }

  // Decoration method if available
  if (!known.decorationMethod && availableMethods.length > 0) {
    questions.push({
      field: 'decorationMethod',
      question: `What decoration method? Options: ${availableMethods.join(', ')}`,
      type: 'select',
      options: availableMethods,
    });
  }

  // If we have decoration method but no color count
  if (known.decorationMethod && !known.decorationColors) {
    questions.push({
      field: 'decorationColors',
      question: 'How many colors in your imprint?',
      type: 'number',
      options: undefined,
    });
  }

  // Return only the first question to keep conversation focused
  return questions.slice(0, 1);
}

// ============ BUILD LINE ITEM ============

export async function buildLineItem(
  parsedRequest: ParsedOrderRequest,
  product: Product,
  pricing: ProductPricing,
  selectedOptions: Record<string, string | number>
): Promise<OrderLineItem> {
  // Merge parsed request with selected options
  const quantity = (selectedOptions.quantity as number) || parsedRequest.quantity || 1;
  const color = (selectedOptions.color as string) || parsedRequest.color || product.parts[0]?.primaryColor || '';
  const size = (selectedOptions.size as string) || parsedRequest.size;

  // Find matching part
  let selectedPart = product.parts.find(p =>
    p.colors.some(c => c.toLowerCase().includes(color.toLowerCase()))
  );
  if (!selectedPart) selectedPart = product.parts[0];

  // Find price for quantity
  let unitPrice = 0;
  for (const pb of pricing.priceBreaks) {
    if (quantity >= pb.quantity) {
      unitPrice = pb.price;
    }
  }

  // Build charges
  const charges: LineItemCharge[] = [];

  // Add decoration charges if applicable
  const decorationMethod = (selectedOptions.decorationMethod as string) || parsedRequest.decorationMethod;
  const decorationColors = (selectedOptions.decorationColors as number) || parsedRequest.decorationColors || 1;
  const decorationLocation = (selectedOptions.decorationLocation as string) || parsedRequest.decorationLocation;

  if (decorationMethod) {
    // Find setup charge
    const setupCharge = pricing.charges.find(c =>
      c.chargeType.toLowerCase().includes('setup') ||
      c.chargeName.toLowerCase().includes('setup')
    );
    if (setupCharge && setupCharge.priceBreaks.length > 0) {
      charges.push({
        name: setupCharge.chargeName,
        description: 'One-time setup fee',
        quantity: 1,
        unitPrice: setupCharge.priceBreaks[0].price,
        extendedPrice: setupCharge.priceBreaks[0].price,
      });
    }

    // Find run charge (per piece decoration)
    const runCharge = pricing.charges.find(c =>
      c.chargeType.toLowerCase().includes('run') ||
      c.chargeName.toLowerCase().includes('imprint') ||
      c.chargeName.toLowerCase().includes('decoration')
    );
    if (runCharge) {
      let runPrice = 0;
      for (const pb of runCharge.priceBreaks) {
        if (quantity >= pb.quantity) {
          runPrice = pb.price;
        }
      }
      if (runPrice > 0) {
        charges.push({
          name: runCharge.chargeName,
          description: `${decorationColors} color(s) - ${decorationLocation || 'standard location'}`,
          quantity: quantity,
          unitPrice: runPrice * decorationColors,
          extendedPrice: runPrice * decorationColors * quantity,
        });
      }
    }
  }

  const extendedPrice = unitPrice * quantity;
  const chargesTotal = charges.reduce((sum, c) => sum + c.extendedPrice, 0);

  return {
    productId: product.productId,
    partId: selectedPart?.partId || '',
    productName: product.productName,
    description: selectedPart?.description || product.description || '',
    color,
    size,
    quantity,
    unitPrice,
    extendedPrice,
    decorationMethod,
    decorationLocation,
    decorationColors,
    charges,
    totalWithCharges: extendedPrice + chargesTotal,
    fobPoint: pricing.fobCity && pricing.fobState ? `${pricing.fobCity}, ${pricing.fobState}` : undefined,
  };
}

// ============ GENERATE RESPONSE MESSAGE ============

export async function generateResponseMessage(
  state: ConversationState
): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `Generate a brief, helpful response for this order entry state.

State: ${state.step}
Product: ${state.product?.productName || 'Not yet identified'}
Questions to ask: ${JSON.stringify(state.questions)}
Line item ready: ${state.lineItem ? 'Yes' : 'No'}

Rules:
- Be conversational but efficient
- If there are questions, introduce them naturally
- If line item is ready, summarize it briefly
- Don't repeat all the technical details, just the essentials
- Keep it under 100 words

Generate ONLY the message text, no JSON or formatting.`
      }
    ],
  });

  const content = message.content[0];
  if (content.type === 'text') {
    return content.text;
  }
  return 'I encountered an issue generating a response. Please try again.';
}
