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
  
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `You are an order entry assistant. Based on what we know and what options are available, determine what clarifying questions to ask the user.

User's original request: "${parsedRequest.rawQuery}"

What we know:
- Product ID: ${parsedRequest.productId || 'unknown'}
- Quantity: ${parsedRequest.quantity || 'unknown'}
- Color: ${parsedRequest.color || 'unknown'}
- Size: ${parsedRequest.size || 'unknown (might not apply)'}
- Decoration Method: ${parsedRequest.decorationMethod || 'unknown'}
- Decoration Colors: ${parsedRequest.decorationColors || 'unknown'}
- Decoration Location: ${parsedRequest.decorationLocation || 'unknown'}

Product info:
- Name: ${product.productName}
- Category: ${product.category || 'N/A'} / ${product.subCategory || 'N/A'}

Available options:
- Colors: ${availableColors.slice(0, 20).join(', ')}${availableColors.length > 20 ? ` (+${availableColors.length - 20} more)` : ''}
- Part IDs: ${availableParts.slice(0, 10).join(', ')}${availableParts.length > 10 ? ` (+${availableParts.length - 10} more)` : ''}
- Decoration Locations: ${availableLocations.join(', ') || 'None listed'}
- Decoration Methods: ${availableMethods.join(', ') || 'None listed'}

Rules:
1. Only ask about things we DON'T already know
2. Only ask about options that ARE available
3. Prioritize: quantity > color/part selection > decoration details
4. Max 3 questions at a time
5. If color is known, try to match it to available colors

Return ONLY valid JSON array of questions:
[
  {
    "field": "fieldName",
    "question": "Human-friendly question",
    "options": ["option1", "option2"] or null for free text,
    "type": "select|number|text"
  }
]

If we have enough info to proceed (at minimum: quantity and part/color selected), return an empty array [].`
      }
    ],
  });

  try {
    const content = message.content[0];
    if (content.type === 'text') {
      return JSON.parse(content.text.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    }
  } catch (e) {
    console.error('Failed to parse questions:', e);
  }

  return [];
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
  const decorationMethod = selectedOptions.decorationMethod as string || parsedRequest.decorationMethod;
  const decorationColors = selectedOptions.decorationColors as number || parsedRequest.decorationColors || 1;
  const decorationLocation = selectedOptions.decorationLocation as string || parsedRequest.decorationLocation;
  
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
