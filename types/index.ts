// PromoStandards API Types
export interface PartPrice {
  minQuantity: number;
  price: number;
  priceUom: string;
}

export interface Part {
  partId: string;
  partDescription: string;
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
