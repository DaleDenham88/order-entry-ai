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

Extract these fields if mentioned (leave blank if not specified):
- productId: The supplier's product ID/SKU (e.g., "5790", "G500", "PC54")
- quantity: Number of items requested
- color: Color requested
- size: Size requested (for apparel)
- decorationMethod: Screen print, embroidery, laser engraving, etc.
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
        quantity: parsed.quantity ? parseInt(parsed.quantity) : undefined,
        decorationColors: parsed.decorationColors ? parseInt(parsed.decorationColors) : undefined,
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
  pricing: ProductPricing
): Promise<ClarifyingQuestion[]> {
  // Build context about available options
  const availableColors = [...new Set(product.parts.flatMap(p => p.colors))];
  const availableParts = product.parts.map(p => p.partId);
  const availableLocations = pricing.decorationLocations.map(l => l.locationName);
  const availableMethods = [...new Set(pricing.decorationLocations.flatMap(l => l.decorationMethods.map(m => m.decorationName)))];
  
  // Build list of what's still missing - be strict about decoration
  const missing: string[] = [];
  if (!parsedRequest.quantity) missing.push('quantity');
  if (!parsedRequest.color) missing.push('color');
  if (!parsedRequest.decorationMethod && availableMethods.length > 0) missing.push('decorationMethod');
  if (!parsedRequest.decorationLocation && availableLocations.length > 0) missing.push('decorationLocation');
  if (!parsedRequest.decorationColors) missing.push('decorationColors');
  
  // If nothing is missing, we're done
  if (missing.length === 0) {
    return [];
  }
  
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `You are an order entry assistant for promotional products. Generate clarifying questions for missing information.

User's original request: "${parsedRequest.rawQuery}"

What we know:
- Product ID: ${parsedRequest.productId || 'unknown'}
- Quantity: ${parsedRequest.quantity || 'MISSING - MUST ASK'}
- Color: ${parsedRequest.color || 'MISSING - MUST ASK'}
- Decoration Method: ${parsedRequest.decorationMethod || 'MISSING - MUST ASK'}
- Decoration Location: ${parsedRequest.decorationLocation || 'MISSING - MUST ASK'}
- Number of Imprint Colors: ${parsedRequest.decorationColors || 'MISSING - MUST ASK'}

Product: ${product.productName}

Available options:
- Colors: ${availableColors.slice(0, 15).join(', ')}${availableColors.length > 15 ? ` (+${availableColors.length - 15} more)` : ''}
- Decoration Locations: ${availableLocations.join(', ') || 'Standard'}
- Decoration Methods: ${availableMethods.join(', ') || 'Standard imprint'}

IMPORTANT RULES:
1. Ask about ALL fields marked "MISSING - MUST ASK" that have available options
2. For decoration method, if multiple are available, you MUST ask
3. For decoration location, if multiple are available, you MUST ask  
4. For imprint colors, always ask "How many colors in your imprint?" (1-6 typical)
5. Ask up to 3 questions at a time, prioritize: quantity > color > decoration method > location > imprint colors
6. Provide options arrays when choices are limited (under 10 options)
7. For colors with many options, provide top 6-8 most common and add "Other" option

Return ONLY valid JSON array:
[
  {
    "field": "quantity",
    "question": "How many do you need?",
    "options": null,
    "type": "number"
  }
]`
      }
    ],
  });

  try {
    const content = message.content[0];
    if (content.type === 'text') {
      const questions = JSON.parse(content.text.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
      return questions.slice(0, 3); // Max 3 at a time
    }
  } catch (e) {
    console.error('Failed to parse questions:', e);
  }

  // Fallback: generate basic questions for missing fields
  const fallbackQuestions: ClarifyingQuestion[] = [];
  if (!parsedRequest.quantity) {
    fallbackQuestions.push({
      field: 'quantity',
      question: 'How many do you need?',
      type: 'number',
    });
  }
  if (!parsedRequest.color && availableColors.length > 0) {
    fallbackQuestions.push({
      field: 'color',
      question: 'What color?',
      options: availableColors.slice(0, 8),
      type: 'select',
    });
  }
  if (!parsedRequest.decorationMethod && availableMethods.length > 0) {
    fallbackQuestions.push({
      field: 'decorationMethod',
      question: 'What decoration method?',
      options: availableMethods,
      type: 'select',
    });
  }
  
  return fallbackQuestions.slice(0, 3);
}

// ============ BUILD LINE ITEM ============

export async function buildLineItem(
  parsedRequest: ParsedOrderRequest,
  product: Product,
  pricing: ProductPricing,
  selectedOptions: Record<string, string | number>
): Promise<OrderLineItem> {
  // Merge parsed request with selected options
  const quantity = selectedOptions.quantity as number || parsedRequest.quantity || 1;
  const color = selectedOptions.color as string || parsedRequest.color || product.parts[0]?.primaryColor || '';
  const size = selectedOptions.size as string || parsedRequest.size;
  const decorationMethod = selectedOptions.decorationMethod as string || parsedRequest.decorationMethod || '';
  const decorationColors = selectedOptions.decorationColors as number || parsedRequest.decorationColors || 1;
  const decorationLocation = selectedOptions.decorationLocation as string || parsedRequest.decorationLocation || '';
  
  // Find matching part
  let selectedPart = product.parts.find(p => 
    p.colors.some(c => c.toLowerCase().includes(color.toLowerCase()))
  );
  if (!selectedPart) selectedPart = product.parts[0];
  
  // Find price for quantity from price breaks
  let unitPrice = 0;
  for (const pb of pricing.priceBreaks) {
    if (quantity >= pb.quantity) {
      unitPrice = pb.price;
    }
  }
  
  // Build charges array - this is where the real value is
  const charges: LineItemCharge[] = [];
  
  // Process all available charges from the pricing data
  for (const charge of pricing.charges) {
    const chargeType = charge.chargeType.toLowerCase();
    const chargeName = charge.chargeName.toLowerCase();
    
    // Determine if this charge applies and calculate it
    let chargeQty = 0;
    let chargeUnitPrice = 0;
    
    // Setup/origination charges (one-time)
    if (chargeType.includes('setup') || chargeType.includes('origination') || 
        chargeName.includes('setup') || chargeName.includes('origination') ||
        chargeName.includes('screen') || chargeName.includes('plate')) {
      chargeQty = decorationColors; // One setup per color
      // Find the price
      if (charge.priceBreaks.length > 0) {
        chargeUnitPrice = charge.priceBreaks[0].price;
      }
    }
    // Run charges (per piece)
    else if (chargeType.includes('run') || chargeName.includes('run') ||
             chargeName.includes('imprint') || chargeName.includes('print') ||
             chargeName.includes('decoration') || chargeName.includes('embroidery')) {
      chargeQty = quantity;
      // Find price for quantity
      for (const pb of charge.priceBreaks) {
        if (quantity >= pb.quantity) {
          chargeUnitPrice = pb.price;
        }
      }
      // Multiply by colors if it's a per-color charge
      if (chargeName.includes('color') || chargeName.includes('additional')) {
        chargeUnitPrice = chargeUnitPrice * decorationColors;
      }
    }
    // Additional color charges
    else if (chargeName.includes('additional color') || chargeName.includes('extra color')) {
      if (decorationColors > 1) {
        chargeQty = decorationColors - 1; // First color often included
        if (charge.priceBreaks.length > 0) {
          chargeUnitPrice = charge.priceBreaks[0].price;
        }
      }
    }
    // PMS match charges
    else if (chargeName.includes('pms') || chargeName.includes('pantone')) {
      // Only add if they likely need PMS matching
      chargeQty = 1;
      if (charge.priceBreaks.length > 0) {
        chargeUnitPrice = charge.priceBreaks[0].price;
      }
    }
    
    // Add the charge if it has value
    if (chargeQty > 0 && chargeUnitPrice > 0) {
      charges.push({
        name: charge.chargeName,
        description: charge.chargeDescription || `${decorationLocation || 'Standard location'}`,
        quantity: chargeQty,
        unitPrice: chargeUnitPrice,
        extendedPrice: chargeQty * chargeUnitPrice,
      });
    }
  }
  
  // If no charges were found from API but we have decoration, add defaults
  if (charges.length === 0 && decorationMethod) {
    // Default setup charge
    charges.push({
      name: 'Setup Charge',
      description: `${decorationMethod} setup - ${decorationColors} color(s)`,
      quantity: decorationColors,
      unitPrice: 50.00, // Default setup per color
      extendedPrice: decorationColors * 50.00,
    });
    
    // Default run charge
    charges.push({
      name: 'Decoration Run Charge',
      description: `${decorationMethod} - ${decorationLocation || 'Standard location'}`,
      quantity: quantity,
      unitPrice: 0.50 * decorationColors, // Default per piece per color
      extendedPrice: quantity * 0.50 * decorationColors,
    });
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
