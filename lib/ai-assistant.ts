import Anthropic from '@anthropic-ai/sdk';
import { ParsedRequest, Question, PricingConfiguration, OrderLineItem, ConversationState, LineItemCharge } from '../types';
import { followUpExamples, formatExamplesForPrompt, findSynonymMatch } from './examples';

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
  currentState: ConversationState,
  availableOptions?: {
    colors?: Array<{ partId: string; name: string }>;
    decorationMethods?: Array<{ id: string; name: string }>;
    decorationLocations?: Array<{ id: string; name: string }>;
    maxDecorationColors?: number;
  }
): Promise<Record<string, any>> {
  // Build context about what options are available
  const colorOptions = availableOptions?.colors?.map(c => c.name).filter(n => n) || [];
  const methodOptions = availableOptions?.decorationMethods?.map(m => m.name) || [];
  const locationOptions = availableOptions?.decorationLocations?.map(l => l.name) || [];
  const maxColors = availableOptions?.maxDecorationColors || 4;

  // First try direct matching without AI for speed
  const directMatch = tryDirectMatch(userInput, availableOptions);
  if (Object.keys(directMatch).length > 0) {
    console.log('Direct match found:', directMatch);
    // Still try AI to catch additional fields
  }

  // Build few-shot examples
  const examples = formatExamplesForPrompt(followUpExamples, 6);

  const prompt = `You are extracting order details from a user's response. Be flexible and understand intent.

AVAILABLE OPTIONS:
- Colors: ${colorOptions.length > 0 ? colorOptions.join(', ') : 'not yet loaded'}
- Decoration Methods: ${methodOptions.length > 0 ? methodOptions.join(', ') : 'not yet loaded'}
- Decoration Locations: ${locationOptions.length > 0 ? locationOptions.join(', ') : 'not yet loaded'}
- Imprint Colors: 1-${maxColors}

WHAT'S STILL NEEDED:
- color/partId: ${currentState.selectedOptions.partId ? 'ALREADY SELECTED' : 'NEEDED'}
- decorationMethod: ${currentState.selectedOptions.decorationMethod ? 'ALREADY SELECTED' : 'NEEDED'}
- decorationLocation: ${currentState.selectedOptions.decorationLocation ? 'ALREADY SELECTED' : 'NEEDED'}
- decorationColors: ${currentState.selectedOptions.decorationColors ? 'ALREADY SELECTED' : 'optional'}

EXAMPLES OF EXTRACTION:
${examples}

NOW EXTRACT FROM:
User's response: "${userInput}"

RULES:
1. Match user's words to the closest AVAILABLE OPTION (case-insensitive, partial matches OK)
2. "silk screen" = "Screen Print", "CB" = "CB DRINKWARE SMALL", etc.
3. Extract ALL fields mentioned, even if we only asked about one
4. For colors like "navy blue" match to "NAVY BLUE", "blue" matches "BLUE"
5. Numbers for decoration colors: "2 color" = 2, "full color" = ${maxColors}
6. "the first one" or "1" when given a list means the first option
7. If user says something like "wrap" and WRAP is an available location, match it

Return ONLY a JSON object with the fields you can extract:
{
  "color": "exact color name from available options or null",
  "partId": "exact partId if you can determine it or null",
  "decorationMethod": "exact method name from available options or null",
  "decorationLocation": "exact location name from available options or null",
  "decorationColors": number or null
}`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0];
    if (content.type === 'text') {
      const text = content.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const aiParsed = JSON.parse(text);
      console.log('AI parsed response:', aiParsed);

      // Merge direct match with AI results
      const result = { ...directMatch };

      // Process AI results, matching to actual available options
      if (aiParsed.color && !result.color) {
        const matchedColor = findSynonymMatch(aiParsed.color, colorOptions);
        if (matchedColor) {
          result.color = matchedColor;
          // Also set partId if we can find it
          const part = availableOptions?.colors?.find(c => c.name === matchedColor);
          if (part) result.partId = part.partId;
        }
      }

      if (aiParsed.partId && !result.partId) {
        result.partId = aiParsed.partId;
      }

      if (aiParsed.decorationMethod && !result.decorationMethod) {
        const matchedMethod = findSynonymMatch(aiParsed.decorationMethod, methodOptions);
        result.decorationMethod = matchedMethod || aiParsed.decorationMethod;
      }

      if (aiParsed.decorationLocation && !result.decorationLocation) {
        const matchedLocation = findSynonymMatch(aiParsed.decorationLocation, locationOptions);
        result.decorationLocation = matchedLocation || aiParsed.decorationLocation;
      }

      if (aiParsed.decorationColors && !result.decorationColors) {
        result.decorationColors = aiParsed.decorationColors;
      }

      return result;
    }
  } catch (e) {
    console.error('AI parsing error:', e);
  }

  return directMatch;
}

// Try to match user input directly without AI for common patterns
function tryDirectMatch(
  userInput: string,
  availableOptions?: {
    colors?: Array<{ partId: string; name: string }>;
    decorationMethods?: Array<{ id: string; name: string }>;
    decorationLocations?: Array<{ id: string; name: string }>;
    maxDecorationColors?: number;
  }
): Record<string, any> {
  const result: Record<string, any> = {};
  const input = userInput.toLowerCase().trim();

  // Try to match color
  if (availableOptions?.colors) {
    for (const color of availableOptions.colors) {
      if (color.name && input.includes(color.name.toLowerCase())) {
        result.color = color.name;
        result.partId = color.partId;
        break;
      }
    }
    // Also check if input exactly matches a color name
    if (!result.color) {
      const exactMatch = availableOptions.colors.find(c =>
        c.name && c.name.toLowerCase() === input
      );
      if (exactMatch) {
        result.color = exactMatch.name;
        result.partId = exactMatch.partId;
      }
    }
  }

  // Try to match decoration method
  if (availableOptions?.decorationMethods) {
    const methodMatch = findSynonymMatch(input, availableOptions.decorationMethods.map(m => m.name));
    if (methodMatch) {
      result.decorationMethod = methodMatch;
    }
  }

  // Try to match decoration location
  if (availableOptions?.decorationLocations) {
    const locationMatch = findSynonymMatch(input, availableOptions.decorationLocations.map(l => l.name));
    if (locationMatch) {
      result.decorationLocation = locationMatch;
    }
  }

  // Try to extract decoration colors
  const colorCountPatterns = [
    /(\d+)\s*color/i,
    /full\s*color/i,
    /single\s*color/i,
    /one\s*color/i,
    /^(\d)$/,
  ];

  for (const pattern of colorCountPatterns) {
    const match = input.match(pattern);
    if (match) {
      if (pattern.source.includes('full')) {
        result.decorationColors = availableOptions?.maxDecorationColors || 4;
      } else if (pattern.source.includes('single') || pattern.source.includes('one')) {
        result.decorationColors = 1;
      } else if (match[1]) {
        result.decorationColors = parseInt(match[1], 10);
      }
      break;
    }
  }

  return result;
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
