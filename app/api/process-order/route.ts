import { NextRequest, NextResponse } from 'next/server';
import { ConversationState, AvailableOptions, RequiredFields, PricingConfiguration, DebugLogEntry } from '@/types';
import { getConfigurationAndPricing, getProductData, getDebugLogs, clearDebugLogs } from '@/lib/promostandards';
import { parseUserRequest, parseUserResponse, buildLineItem } from '@/lib/ai-assistant';

export async function POST(request: NextRequest) {
  // Clear debug logs at the start of each request
  clearDebugLogs();

  try {
    const body = await request.json();
    const { userInput, currentState, selectionUpdate } = body as {
      userInput: string;
      currentState: ConversationState | null;
      selectionUpdate?: { field: string; value: string | number | null };
    };

    // Handle direct selection updates from UI clicks
    if (selectionUpdate && currentState) {
      return handleSelectionUpdate(currentState, selectionUpdate);
    }

    // Check for reset/new order commands
    const resetPatterns = [
      /^(start\s+)?(new|another)\s+order/i,
      /^start\s+over/i,
      /^reset/i,
      /^clear/i,
    ];
    if (resetPatterns.some(p => p.test(userInput.trim()))) {
      return NextResponse.json({
        success: true,
        resetOrder: true,
        message: 'Starting a new order! What would you like to order?',
        debugLogs: getDebugLogs(),
      });
    }

    // Check for quantity-only updates when we have an existing order
    if (currentState && userInput.trim()) {
      const qtyMatch = userInput.match(/^(\d+)$/) ||
                       userInput.match(/(?:quantity|qty)[:\s]+(\d+)/i) ||
                       userInput.match(/(\d+)\s+(?:units?|pieces?|items?)/i);
      if (qtyMatch) {
        const qty = parseInt(qtyMatch[1], 10);
        if (qty > 0) {
          return handleSelectionUpdate(currentState, { field: 'quantity', value: qty });
        }
      }
    }

    // Initial request - parse and fetch data
    if (!currentState) {
      const parsedRequest = await parseUserRequest(userInput);

      // Need productId to proceed
      if (!parsedRequest.productId) {
        return NextResponse.json({
          success: false,
          error: 'Please specify a product ID (e.g., "order 500 of product 55900")',
          debugLogs: getDebugLogs(),
        });
      }

      // Fetch pricing configuration
      const pricingData = await getConfigurationAndPricing(parsedRequest.productId);
      const productData = await getProductData(parsedRequest.productId);

      // Match color to partId if color is specified
      if (parsedRequest.color && !parsedRequest.partId) {
        const matchingPart = pricingData.parts.find(p =>
          p.partDescription.toLowerCase().includes(parsedRequest.color!.toLowerCase())
        );
        if (matchingPart) {
          parsedRequest.partId = matchingPart.partId;
        }
      }

      // Match decoration method if specified
      let matchedDecorationMethod: string | undefined;
      let matchedDecorationLocation: string | undefined;

      if (parsedRequest.decorationMethod) {
        for (const location of pricingData.locations) {
          const decoration = location.decorations.find(d =>
            d.decorationName.toLowerCase().includes(parsedRequest.decorationMethod!.toLowerCase())
          );
          if (decoration) {
            matchedDecorationMethod = decoration.decorationName;
            if (!parsedRequest.decorationLocation) {
              matchedDecorationLocation = location.locationName;
            }
            break;
          }
        }
      }

      if (parsedRequest.decorationLocation) {
        const location = pricingData.locations.find(l =>
          l.locationName.toLowerCase().includes(parsedRequest.decorationLocation!.toLowerCase())
        );
        if (location) {
          matchedDecorationLocation = location.locationName;
        }
      }

      const newState: ConversationState = {
        parsedRequest,
        selectedOptions: {
          ...parsedRequest,
          decorationMethod: matchedDecorationMethod || parsedRequest.decorationMethod,
          decorationLocation: matchedDecorationLocation || parsedRequest.decorationLocation,
        },
        questions: [],
        pricingData,
      };

      // Auto-select single options
      autoSelectSingleOptions(newState, pricingData);

      // Build available options for the UI
      const availableOptions = buildAvailableOptions(pricingData, newState.selectedOptions);
      const requiredFields = getRequiredFields(newState.selectedOptions);

      // Debug logging
      console.log('Pricing data parts:', pricingData.parts.length);
      console.log('Pricing data locations:', pricingData.locations.length);
      console.log('Available options:', JSON.stringify(availableOptions, null, 2));

      // Check if we can build a line item (all required fields filled)
      if (allRequiredFieldsFilled(requiredFields)) {
        const lineItem = buildLineItem(newState, productData.productName);
        if (lineItem) {
          newState.lineItem = lineItem;
          return NextResponse.json({
            success: true,
            state: newState,
            message: `Great! Here's your order summary for ${productData.productName}:`,
            availableOptions,
            requiredFields,
            productInfo: {
              productId: pricingData.productId,
              productName: productData.productName,
              quantity: parsedRequest.quantity || 0,
            },
            debugLogs: getDebugLogs(),
          });
        }
      }

      // Return with options for selection
      const missingFields = getMissingFieldsList(requiredFields);
      return NextResponse.json({
        success: true,
        state: newState,
        message: `Found product ${productData.productName}! Please select the following to complete your order: ${missingFields.join(', ')}.`,
        availableOptions,
        requiredFields,
        productInfo: {
          productId: pricingData.productId,
          productName: productData.productName,
          quantity: parsedRequest.quantity || 0,
        },
        debugLogs: getDebugLogs(),
      });
    }

    // Follow-up response - parse answer and update state
    // Build available options context for the AI
    const optionsContext = currentState.pricingData ? {
      colors: currentState.pricingData.parts.map(p => ({ partId: p.partId, name: p.partDescription })),
      decorationMethods: getUniqueDecorationMethods(currentState.pricingData),
      decorationLocations: currentState.pricingData.locations.map(l => ({ id: l.locationId, name: l.locationName })),
      maxDecorationColors: getMaxDecorationColors(currentState.pricingData),
    } : undefined;

    const extracted = await parseUserResponse(userInput, currentState, optionsContext);
    console.log('Extracted from follow-up:', extracted);

    // Try to match extracted values to actual options
    if (currentState.pricingData) {
      // Match color/part
      if (extracted.color || extracted.partId) {
        const colorValue = extracted.color || extracted.partId;
        const matchingPart = currentState.pricingData.parts.find(p =>
          p.partId.toLowerCase() === String(colorValue).toLowerCase() ||
          p.partDescription.toLowerCase().includes(String(colorValue).toLowerCase())
        );
        if (matchingPart) {
          extracted.partId = matchingPart.partId;
        }
      }

      // Match decoration method
      if (extracted.decorationMethod) {
        for (const location of currentState.pricingData.locations) {
          const decoration = location.decorations.find(d =>
            d.decorationName.toLowerCase().includes(String(extracted.decorationMethod).toLowerCase())
          );
          if (decoration) {
            extracted.decorationMethod = decoration.decorationName;
            // If location not set, use this location
            if (!currentState.selectedOptions.decorationLocation && !extracted.decorationLocation) {
              extracted.decorationLocation = location.locationName;
            }
            break;
          }
        }
      }

      // Match decoration location
      if (extracted.decorationLocation) {
        const location = currentState.pricingData.locations.find(l =>
          l.locationName.toLowerCase().includes(String(extracted.decorationLocation).toLowerCase())
        );
        if (location) {
          extracted.decorationLocation = location.locationName;
        }
      }
    }

    // Merge extracted values into selectedOptions
    for (const [key, value] of Object.entries(extracted)) {
      if (value !== null && value !== undefined) {
        currentState.selectedOptions[key] = value;
      }
    }

    // Build updated options and required fields
    const availableOptions = currentState.pricingData
      ? buildAvailableOptions(currentState.pricingData, currentState.selectedOptions)
      : undefined;
    const requiredFields = getRequiredFields(currentState.selectedOptions);

    // If all required fields are filled, build line item
    if (allRequiredFieldsFilled(requiredFields) && currentState.pricingData) {
      const productData = await getProductData(currentState.pricingData.productId);
      const lineItem = buildLineItem(currentState, productData.productName);

      if (lineItem) {
        currentState.lineItem = lineItem;
        return NextResponse.json({
          success: true,
          state: currentState,
          message: `Perfect! Here's your complete order:`,
          availableOptions,
          requiredFields,
          productInfo: {
            productId: currentState.pricingData.productId,
            productName: productData.productName,
            quantity: currentState.selectedOptions.quantity || currentState.parsedRequest.quantity || 0,
          },
          debugLogs: getDebugLogs(),
        });
      }
    }

    // Still need selections
    const missingFields = getMissingFieldsList(requiredFields);
    const productData = currentState.pricingData
      ? await getProductData(currentState.pricingData.productId)
      : { productName: 'Unknown Product' };

    return NextResponse.json({
      success: true,
      state: currentState,
      message: missingFields.length > 0
        ? `Please select: ${missingFields.join(', ')}`
        : 'Processing your selections...',
      availableOptions,
      requiredFields,
      productInfo: currentState.pricingData ? {
        productId: currentState.pricingData.productId,
        productName: productData.productName,
        quantity: currentState.selectedOptions.quantity || currentState.parsedRequest.quantity || 0,
      } : undefined,
      debugLogs: getDebugLogs(),
    });

  } catch (error) {
    console.error('Order processing error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      debugLogs: getDebugLogs(),
    });
  }
}

async function handleSelectionUpdate(
  currentState: ConversationState,
  selectionUpdate: { field: string; value: string | number | null }
) {
  const { field, value } = selectionUpdate;

  // Update the selected option
  if (value === null) {
    delete currentState.selectedOptions[field];
  } else {
    currentState.selectedOptions[field] = value;
  }

  // If selecting a decoration method, auto-select the location if only one is available
  if (field === 'decorationMethod' && value && currentState.pricingData) {
    const locationsWithMethod = currentState.pricingData.locations.filter(l =>
      l.decorations.some(d => d.decorationName === value)
    );
    if (locationsWithMethod.length === 1 && !currentState.selectedOptions.decorationLocation) {
      currentState.selectedOptions.decorationLocation = locationsWithMethod[0].locationName;
    }
  }

  // Build updated options and required fields
  const availableOptions = currentState.pricingData
    ? buildAvailableOptions(currentState.pricingData, currentState.selectedOptions)
    : undefined;
  const requiredFields = getRequiredFields(currentState.selectedOptions);

  // If all required fields are filled, build line item
  if (allRequiredFieldsFilled(requiredFields) && currentState.pricingData) {
    const productData = await getProductData(currentState.pricingData.productId);
    const lineItem = buildLineItem(currentState, productData.productName);

    if (lineItem) {
      currentState.lineItem = lineItem;
      return NextResponse.json({
        success: true,
        state: currentState,
        message: `Order complete!`,
        availableOptions,
        requiredFields,
        productInfo: {
          productId: currentState.pricingData.productId,
          productName: productData.productName,
          quantity: currentState.selectedOptions.quantity || currentState.parsedRequest.quantity || 0,
        },
      });
    }
  }

  // Still need more selections
  const missingFields = getMissingFieldsList(requiredFields);
  const productData = currentState.pricingData
    ? await getProductData(currentState.pricingData.productId)
    : { productName: 'Unknown Product' };

  return NextResponse.json({
    success: true,
    state: currentState,
    message: missingFields.length > 0
      ? `Selected ${field}. Still need: ${missingFields.join(', ')}`
      : 'All selections made!',
    availableOptions,
    requiredFields,
    productInfo: currentState.pricingData ? {
      productId: currentState.pricingData.productId,
      productName: productData.productName,
      quantity: currentState.selectedOptions.quantity || currentState.parsedRequest.quantity || 0,
    } : undefined,
  });
}

function buildAvailableOptions(pricingData: PricingConfiguration, selectedOptions: Record<string, any>): AvailableOptions {
  // Filter parts to only show main product colors (partGroup 1 or no partGroup)
  // partGroup 2+ are typically accessories like lids
  const mainParts = pricingData.parts.filter(p =>
    p.partGroup === undefined || p.partGroup === 1
  );

  // Get unique decoration methods across all locations
  // Filter out charge-like names (e.g., "CB DRINKWARE SMALL", "CB DRINKWARE LARGE")
  const decorationMethodsMap = new Map<string, { id: string; maxColors: number }>();

  // Common patterns that indicate a charge name rather than a decoration method
  const chargePatterns = [
    /\b(small|large|medium|xl|xxl)\s*$/i,  // Size suffixes
    /^cb\s/i,  // "CB " prefix (charge-based)
    /drinkware/i,  // Drinkware charges
  ];

  for (const location of pricingData.locations) {
    for (const decoration of location.decorations) {
      const name = decoration.decorationName;

      // Skip if it looks like a charge name rather than a decoration method
      const isChargeName = chargePatterns.some(pattern => pattern.test(name));
      if (isChargeName) {
        console.log('Filtered out charge-like decoration method:', name);
        continue;
      }

      // Track the max colors for each method
      const existing = decorationMethodsMap.get(name);
      if (!existing || decoration.decorationUnitsMax > existing.maxColors) {
        decorationMethodsMap.set(name, {
          id: decoration.decorationId,
          maxColors: decoration.decorationUnitsMax,
        });
      }
    }
  }

  // Calculate overall max colors from valid decoration methods
  let maxColors = 1;
  for (const method of decorationMethodsMap.values()) {
    if (method.maxColors > maxColors) {
      maxColors = method.maxColors;
    }
  }

  return {
    colors: mainParts.map(p => ({
      partId: p.partId,
      name: p.partDescription,
      selected: selectedOptions.partId === p.partId,
    })),
    decorationMethods: Array.from(decorationMethodsMap.entries()).map(([name, data]) => ({
      id: data.id,
      name,
      selected: selectedOptions.decorationMethod === name,
    })),
    decorationLocations: pricingData.locations.map(l => ({
      id: l.locationId,
      name: l.locationName,
      selected: selectedOptions.decorationLocation === l.locationName,
    })),
    decorationColors: {
      min: 0,  // Allow 0 for laser engraving
      max: maxColors,
      selected: selectedOptions.decorationColors ?? null,
    },
  };
}

function getRequiredFields(selectedOptions: Record<string, any>): RequiredFields {
  return {
    quantity: !selectedOptions.quantity,
    color: !selectedOptions.partId,
    decorationMethod: !selectedOptions.decorationMethod,
    decorationLocation: !selectedOptions.decorationLocation,
    // 0 is a valid value for decorationColors (laser engraving)
    decorationColors: selectedOptions.decorationColors === undefined || selectedOptions.decorationColors === null,
  };
}

function getMissingFieldsList(requiredFields: RequiredFields): string[] {
  const missing: string[] = [];
  if (requiredFields.quantity) missing.push('quantity');
  if (requiredFields.color) missing.push('color');
  if (requiredFields.decorationMethod) missing.push('decoration method');
  if (requiredFields.decorationLocation) missing.push('decoration location');
  if (requiredFields.decorationColors) missing.push('imprint colors');
  return missing;
}

function allRequiredFieldsFilled(requiredFields: RequiredFields): boolean {
  return !requiredFields.quantity &&
         !requiredFields.color &&
         !requiredFields.decorationMethod &&
         !requiredFields.decorationLocation &&
         !requiredFields.decorationColors;
}

// Auto-select options when only one choice is available
function autoSelectSingleOptions(state: ConversationState, pricingData: PricingConfiguration): void {
  // Filter out parts without descriptions (like accessories)
  const mainParts = pricingData.parts.filter(p => p.partDescription && p.partDescription.trim() !== '');

  // Auto-select color if only one main color option
  if (!state.selectedOptions.partId && mainParts.length === 1) {
    state.selectedOptions.partId = mainParts[0].partId;
    console.log('Auto-selected single color:', mainParts[0].partDescription);
  }

  // Get unique decoration methods
  const methods = getUniqueDecorationMethods(pricingData);

  // Auto-select decoration method if only one
  if (!state.selectedOptions.decorationMethod && methods.length === 1) {
    state.selectedOptions.decorationMethod = methods[0].name;
    console.log('Auto-selected single decoration method:', methods[0].name);
  }

  // Auto-select location if only one
  if (!state.selectedOptions.decorationLocation && pricingData.locations.length === 1) {
    state.selectedOptions.decorationLocation = pricingData.locations[0].locationName;
    console.log('Auto-selected single location:', pricingData.locations[0].locationName);
  }

  // Auto-select decoration colors if max is 1
  const maxColors = getMaxDecorationColors(pricingData);
  if (!state.selectedOptions.decorationColors && maxColors === 1) {
    state.selectedOptions.decorationColors = 1;
    console.log('Auto-selected single imprint color');
  }
}

// Get unique decoration methods across all locations
function getUniqueDecorationMethods(pricingData: PricingConfiguration): Array<{ id: string; name: string }> {
  const methodsMap = new Map<string, string>();
  for (const location of pricingData.locations) {
    for (const decoration of location.decorations) {
      methodsMap.set(decoration.decorationName, decoration.decorationId);
    }
  }
  return Array.from(methodsMap.entries()).map(([name, id]) => ({ id, name }));
}

// Get maximum decoration colors across all decorations
function getMaxDecorationColors(pricingData: PricingConfiguration): number {
  let maxColors = 1;
  for (const location of pricingData.locations) {
    for (const decoration of location.decorations) {
      if (decoration.decorationUnitsMax > maxColors) {
        maxColors = decoration.decorationUnitsMax;
      }
    }
  }
  return maxColors;
}
