// types/index.ts

// ============ PARSED REQUEST ============

export interface ParsedOrderRequest {
  productId?: string;
  partId?: string;
  quantity?: number;
  color?: string;
  size?: string;
  decorationMethod?: string;
  decorationColors?: number;
  decorationLocation?: string;
  supplierName?: string;
  rawQuery: string;
  confidence: 'high' | 'medium' | 'low';
  missingFields: string[];
}

// ============ PROMOSTANDARDS TYPES ============

export interface ProductPart {
  partId: string;
  description?: string;
  colors: string[];
  sizes?: string[];
  countryOfOrigin?: string;
  primaryColor?: string;
}

export interface Product {
  productId: string;
  productName: string;
  description?: string;
  category?: string;
  subCategory?: string;
  parts: ProductPart[];
  priceType?: string;
  imageUrl?: string;
}

export interface PriceBreak {
  quantity: number;
  price: number;
  discountCode?: string;
}

export interface Charge {
  chargeId: string;
  chargeName: string;
  chargeType: string;
  chargeDescription?: string;
  priceBreaks: PriceBreak[];
}

export interface DecorationLocation {
  locationId: string;
  locationName: string;
  decorationMethods: DecorationMethod[];
  maxColors?: number;
  maxArea?: string;
}

export interface DecorationMethod {
  decorationId: string;
  decorationName: string;
}

export interface ProductPricing {
  productId: string;
  partId: string;
  currency: string;
  fobId?: string;
  fobCity?: string;
  fobState?: string;
  priceBreaks: PriceBreak[];
  charges: Charge[];
  decorationLocations: DecorationLocation[];
}

// ============ CONVERSATION STATE ============

export type ConversationStep = 
  | 'initial'
  | 'product_found'
  | 'clarifying_product'
  | 'clarifying_options'
  | 'calculating_price'
  | 'complete';

export interface ClarifyingQuestion {
  field: string;
  question: string;
  options?: string[];
  type: 'select' | 'number' | 'text';
}

export interface ConversationState {
  step: ConversationStep;
  parsedRequest: ParsedOrderRequest;
  product?: Product;
  pricing?: ProductPricing;
  selectedOptions: Record<string, string | number>;
  questions: ClarifyingQuestion[];
  lineItem?: OrderLineItem;
}

// ============ LINE ITEM OUTPUT ============

export interface LineItemCharge {
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  extendedPrice: number;
}

export interface OrderLineItem {
  productId: string;
  partId: string;
  productName: string;
  description: string;
  color: string;
  size?: string;
  quantity: number;
  unitPrice: number;
  extendedPrice: number;
  decorationMethod?: string;
  decorationLocation?: string;
  decorationColors?: number;
  charges: LineItemCharge[];
  totalWithCharges: number;
  notes?: string;
  fobPoint?: string;
}

// ============ API RESPONSES ============

export interface ParseRequestResponse {
  success: boolean;
  parsed?: ParsedOrderRequest;
  error?: string;
}

export interface PromoStandardsResponse {
  success: boolean;
  product?: Product;
  pricing?: ProductPricing;
  error?: string;
  rawXml?: string;
}

export interface GenerateLineItemResponse {
  success: boolean;
  state: ConversationState;
  message: string;
  error?: string;
}
