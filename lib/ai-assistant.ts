import Anthropic from '@anthropic-ai/sdk';
import { ParsedRequest, Question, PricingConfiguration, OrderLineItem, ConversationState, LineItemCharge } from '../types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function parseUserRequest(userInput: string): Promise<ParsedRequest> {
  // First, try to extract common patterns with regex for reliability
  const result: ParsedRequest = {};

  // Extract quantity - look for numbers followed by "of" or at the start
  const qtyPatterns = [
    /(\d+)\s+of\s+/i,                    // "500 of product"
    /order\s+(\d+)\s+/i,                  // "order 500"
    /^(\d+)\s+/i,                         // "500 black tumblers"
    /quantity[:\s]+(\d+)/i,               // "quantity: 500"
  ];

  for (const pattern of qtyPatterns) {
    const match = userInput.match(pattern);
    if (match) {
      result.quantity = parseInt(match[1], 10);
      break;
    }
  }

  // Extract product ID - look for product numbers (typically 4-6 digits)
  const productPatterns = [
    /product\s*#?\s*(\d{4,6})/i,          // "product 55900" or "product #55900"
    /(?:of|order)\s+#?(\d{4,6})/i,        // "of 55900" or "order 55900"
    /item\s*#?\s*(\d{4,6})/i,             // "item 55900"
    /#(\d{4,6})/i,                         // "#55900"
    /\b(\d{4,6})\b/,                       // any 4-6 digit number as fallback
  ];

  for (const pattern of productPatterns) {
    const match = userInput.match(pattern);
    if (match) {
      // Make sure we don't pick up the quantity as product ID
      const potentialId = match[1];
      if (potentialId !== String(result.quantity)) {
        result.productId = potentialId;
        break;
      }
    }
  }

  // If we still don't have a product ID, look for any remaining number
  if (!result.productId) {
    // Remove the quantity from the string and look for remaining numbers
    let remaining = userInput;
    if (result.quantity) {
      remaining = remaining.replace(String(result.quantity), '');
    }
    const numMatch = remaining.match(/\b(\d{4,6})\b/);
    if (numMatch) {
      result.productId = numMatch[1];
    }
  }

  // Use AI to extract the rest (color, decoration details)
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Extract order details from this request. Return ONLY a JSON object.

User request: "${userInput}"

Extract these fields (use null if not mentioned):
- color: string (color name like "black", "red", "blue")
- decorationMethod: string (e.g., "silk screen", "laser engrave", "embroidery")
- decorationLocation: string (e.g., "front", "back", "side", "wrap")
- decorationColors: number (how many imprint colors, e.g., "one color" = 1, "full color" = 4)

Return ONLY valid JSON like: {"color": null, "decorationMethod": null, "decorationLocation": null, "decorationColors": null}`,
      }],
    });

    const content = message.content[0];
    if (content.type === 'text') {
      const text = content.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const aiParsed = JSON.parse(text);

      // Merge AI results with regex results (regex takes priority for qty/productId)
      if (aiParsed.color) result.color = aiParsed.color;
      if (aiParsed.decorationMethod) result.decorationMethod = aiParsed.decorationMethod;
      if (aiParsed.decorationLocation) result.decorationLocation = aiParsed.decorationLocation;
      if (aiParsed.decorationColors) result.decorationColors = aiParsed.decorationColors;

      // If AI found productId/quantity and we didn't, use those
      if (!result.productId && aiParsed.productId) result.productId = aiParsed.productId;
      if (!result.quantity && aiParsed.quantity) result.quantity = aiParsed.quantity;
    }
  } catch (e) {
    console.error('AI parsing error:', e);
    // Continue with regex-extracted values
  }

  console.log('Parsed request:', result);
  return result;
}

export async function generateQuestions(
  parsedRequest: ParsedRequest,
  pricingData: PricingConfiguration
): Promise<Question[]> {
  const prompt = `You are helping complete an order. Analyze what's missing and generate ONLY the essential questions.

Current request: ${JSON.stringify(parsedRequest)}

Available data:
- Parts/Colors: ${pricingData.parts.map(p => `${p.partId} (${p.partDescription})`).join(', ')}
- Locations: ${pricingData.locations.map(l => l.locationName).join(', ')}
- Decoration methods: ${pricingData.locations[0]?.decorations.map(d => d.decorationName).join(', ')}

Return a JSON array of questions ONLY for missing required fields. Each question should have:
{
  "field": "partId|decorationMethod|decorationLocation|decorationColors",
  "question": "user-friendly question text",
  "options": ["option1", "option2"]  // if applicable
}

Rules:
- If color is mentioned, match it to a partId
- If quantity exists, don't ask about it
- If decoration method is mentioned, match it to available methods
- Keep questions minimal and friendly
- Return empty array [] if nothing is missing

Return ONLY the JSON array, no other text.`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = message.content[0];
  if (content.type === 'text') {
    try {
      const text = content.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(text);
    } catch (e) {
      console.error('Failed to parse questions:', e);
      return [];
    }
  }
  return [];
}

export async function parseUserResponse(
  userInput: string,
  currentState: ConversationState
): Promise<Record<string, any>> {
  const prompt = `Extract answers from the user's response to fill in missing order details.

Current questions waiting for answers: ${JSON.stringify(currentState.questions)}

User's response: "${userInput}"

Return a JSON object with field names as keys and extracted values. Only include fields that were answered.

Return ONLY the JSON object, no other text.`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = message.content[0];
  if (content.type === 'text') {
    try {
      const text = content.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(text);
    } catch (e) {
      return {};
    }
  }
  return {};
}

export function buildLineItem(
  state: ConversationState,
  productName: string
): OrderLineItem | null {
  const { parsedRequest, selectedOptions, pricingData } = state;
  
  if (!pricingData) return null;
  
  const quantity = selectedOptions.quantity || parsedRequest.quantity;
  const partId = selectedOptions.partId || parsedRequest.partId;
  const decorationMethod = selectedOptions.decorationMethod || parsedRequest.decorationMethod;
  const decorationLocation = selectedOptions.decorationLocation || parsedRequest.decorationLocation;
  const decorationColors = selectedOptions.decorationColors || parsedRequest.decorationColors || 1;
  
  if (!quantity || !partId) return null;
  
  // Find the part
  const part = pricingData.parts.find(p => p.partId === partId);
  if (!part) return null;
  
  // Get unit price based on quantity
  let unitPrice = 0;
  for (const priceBreak of part.priceBreaks) {
    if (quantity >= priceBreak.minQuantity) {
      unitPrice = priceBreak.price;
    }
  }
  
  const extendedPrice = unitPrice * quantity;
  const charges: LineItemCharge[] = [];
  
  // Add decoration charges if decoration method is specified
  if (decorationMethod && decorationLocation) {
    const location = pricingData.locations.find(l => 
      l.locationName.toLowerCase() === decorationLocation.toLowerCase() ||
      l.locationId === decorationLocation
    );
    
    if (location) {
      const decoration = location.decorations.find(d => 
        d.decorationName.toLowerCase().includes(decorationMethod.toLowerCase())
      );
      
      if (decoration) {
        // Add setup charges
        const setupCharges = decoration.charges.filter(c => c.chargeType === 'Setup');
        for (const charge of setupCharges) {
          if (charge.priceArray.length > 0) {
            const chargePrice = charge.priceArray[0];
            // Use price for first setup, repeatPrice would be for repeat orders
            const price = chargePrice.price;
            charges.push({
              name: charge.chargeName,
              description: `${charge.chargeDescription} - Setup`,
              quantity: 1,
              unitPrice: price,
              extendedPrice: price,
            });
          }
        }
        
        // Add run charges
        const runCharges = decoration.charges.filter(c => c.chargeType === 'Run');
        for (const charge of runCharges) {
          if (charge.priceArray.length > 0) {
            const chargePrice = charge.priceArray[0];
            
            // Check if this is a color-based charge
            if (chargePrice.yUom === 'Colors' && decorationColors > chargePrice.yMinQty) {
              // Extra color charge
              const extraColors = decorationColors - decoration.decorationUnitsIncluded;
              if (extraColors > 0) {
                charges.push({
                  name: charge.chargeName,
                  description: `${extraColors} extra color(s)`,
                  quantity: quantity,
                  unitPrice: chargePrice.price,
                  extendedPrice: chargePrice.price * quantity * extraColors,
                });
              }
            } else if (chargePrice.yUom !== 'Colors') {
              // Standard run charge (like imprint per piece)
              charges.push({
                name: charge.chargeName,
                description: charge.chargeDescription,
                quantity: quantity,
                unitPrice: chargePrice.price,
                extendedPrice: chargePrice.price * quantity,
              });
            }
          }
        }
      }
    }
  }
  
  const chargesTotal = charges.reduce((sum, c) => sum + c.extendedPrice, 0);
  
  return {
    productId: pricingData.productId,
    productName,
    partId,
    description: part.partDescription,
    quantity,
    unitPrice,
    extendedPrice,
    decorationMethod,
    decorationLocation,
    decorationColors,
    charges,
    totalWithCharges: extendedPrice + chargesTotal,
  };
}
