// PromoStandards API Types
export interface PartPrice {
  minQuantity: number;
  price: number;
  priceUom: string;
}

export interface Part {
  partId: string;
  partDescription: string;
  partGroup?: number;
  priceBreaks: PartPrice[];
}

export interface ChargePrice {
  xMinQty: number;
  xUom: string;
  yMinQty: number;
  yUom: string;
  price: number;
  repeatPrice: number;
}

export interface Charge {
  chargeId: string;
  chargeName: string;
  chargeDescription: string;
  chargeType: "Setup" | "Run";
  priceArray: ChargePrice[];
}

export interface Decoration {
  decorationId: string;
  decorationName: string;
  decorationGeometry: string;
  decorationHeight: number;
  decorationWidth: number;
  decorationUom: string;
  decorationUnitsIncluded: number;
  decorationUnitsMax: number;
  defaultDecoration: boolean;
  charges: Charge[];
}

export interface Location {
  locationId: string;
  locationName: string;
  decorations: Decoration[];
  defaultLocation: boolean;
}

export interface PricingConfiguration {
  productId: string;
  currency: string;
  parts: Part[];
  locations: Location[];
}

// Order Entry Types
export interface ParsedRequest {
  productId?: string;
  quantity?: number;
  color?: string;
  partId?: string;
  decorationMethod?: string;
  decorationLocation?: string;
  decorationColors?: number;
}

export interface Question {
  field: string;
  question: string;
  options?: string[];
}

export interface LineItemCharge {
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  extendedPrice: number;
}

export interface OrderLineItem {
  productId: string;
  productName: string;
  partId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  extendedPrice: number;
  decorationMethod?: string;
  decorationLocation?: string;
  decorationColors?: number;
  charges: LineItemCharge[];
  totalWithCharges: number;
}

export interface ConversationState {
  parsedRequest: ParsedRequest;
  selectedOptions: Record<string, any>;
  questions: Question[];
  pricingData?: PricingConfiguration;
  lineItem?: OrderLineItem;
}

// Available options for display in the UI
export interface AvailableOptions {
  colors: Array<{ partId: string; name: string; selected: boolean }>;
  decorationMethods: Array<{ id: string; name: string; selected: boolean }>;
  decorationLocations: Array<{ id: string; name: string; selected: boolean }>;
  decorationColors: { min: number; max: number; selected: number | null };
}

// What fields are still required
export interface RequiredFields {
  quantity: boolean;
  color: boolean;
  decorationMethod: boolean;
  decorationLocation: boolean;
  decorationColors: boolean;
}

// Debug log entry for API calls
export interface DebugLogEntry {
  timestamp: string;
  operation: string;
  request?: string;
  response?: string;
  error?: string;
}

// Extended API response for better UI
export interface OrderApiResponse {
  success: boolean;
  state: ConversationState;
  message: string;
  error?: string;
  availableOptions?: AvailableOptions;
  requiredFields?: RequiredFields;
  productInfo?: {
    productId: string;
    productName: string;
    quantity: number;
  };
  debugLogs?: DebugLogEntry[];
}

// Learning System Types
export interface LearningExample {
  id: string;
  type: 'parsing' | 'color' | 'decoration' | 'location' | 'quantity';
  userInput: string;
  matchedValue: string;
  context?: string; // Additional context like product category
  confidence: number; // 0-1, higher = more reliable
  usageCount: number; // How many times this example has been used
  createdAt: string;
  lastUsedAt: string;
}

export interface LearningCorrection {
  id: string;
  userInput: string;
  originalMatch: string | null; // What the system matched (null if no match)
  correctedValue: string; // What it should have been
  field: 'color' | 'decorationMethod' | 'decorationLocation' | 'decorationColors' | 'quantity';
  createdAt: string;
}

export interface LearningFeedback {
  interactionId: string;
  wasCorrect: boolean;
  userInput: string;
  selections: Record<string, any>;
  correction?: {
    field: string;
    wrongValue: any;
    correctValue: any;
  };
  timestamp: string;
}

export interface LearningStats {
  totalExamples: number;
  totalCorrections: number;
  accuracyRate: number;
  topPatterns: Array<{ pattern: string; count: number }>;
}
