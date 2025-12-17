// lib/promostandards.ts

import { Product, ProductPart, ProductPricing, PriceBreak, Charge, DecorationLocation, DecorationMethod } from '@/types';

// HIT Promotional Products endpoints
const HIT_ENDPOINTS = {
  productData: 'https://ppds.hitpromo.net/productData?ws=1',
  ppc: 'https://ppds.hitpromo.net/pricingAndConfiguration?ws=1',
  inventory: 'https://ppds.hitpromo.net/inventory',
};

const CREDENTIALS = {
  id: 'extendtech',
  password: 'e8e1d66dfeefdf2f0f89f013dde032b9',
};

// Use local API route for SOAP proxy (works on Vercel)
// In production, this resolves to the same domain
const SOAP_PROXY_URL = process.env.SOAP_PROXY_URL || '/api/proxy-soap';

interface SoapCallParams {
  endpoint: string;
  soapAction: string;
  xmlBody: string;
}

async function callSoapProxy(params: SoapCallParams): Promise<string> {
  const response = await fetch(SOAP_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  
  const result = await response.json();
  
  if (result.error) {
    throw new Error(result.error);
  }
  
  return result.responseText;
}

// ============ PRODUCT DATA SERVICE ============

export async function getProduct(productId: string): Promise<Product | null> {
  const xmlBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
               xmlns:ns="http://www.promostandards.org/WSDL/ProductDataService/1.0.0/" 
               xmlns:shar="http://www.promostandards.org/WSDL/ProductDataService/1.0.0/SharedObjects/">
  <soap:Body>
    <ns:GetProductRequest>
      <shar:wsVersion>1.0.0</shar:wsVersion>
      <shar:id>${CREDENTIALS.id}</shar:id>
      <shar:password>${CREDENTIALS.password}</shar:password>
      <shar:localizationCountry>US</shar:localizationCountry>
      <shar:localizationLanguage>en</shar:localizationLanguage>
      <shar:productId>${productId}</shar:productId>
    </ns:GetProductRequest>
  </soap:Body>
</soap:Envelope>`;

  try {
    const responseXml = await callSoapProxy({
      endpoint: HIT_ENDPOINTS.productData,
      soapAction: 'getProduct',
      xmlBody,
    });
    
    return parseProductResponse(responseXml);
  } catch (error) {
    console.error('Error fetching product:', error);
    return null;
  }
}

export async function getProductSellable(): Promise<Array<{ productId: string; partId?: string }>> {
  const xmlBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
               xmlns:ns="http://www.promostandards.org/WSDL/ProductDataService/1.0.0/" 
               xmlns:shar="http://www.promostandards.org/WSDL/ProductDataService/1.0.0/SharedObjects/">
  <soap:Body>
    <ns:GetProductSellableRequest>
      <shar:wsVersion>1.0.0</shar:wsVersion>
      <shar:id>${CREDENTIALS.id}</shar:id>
      <shar:password>${CREDENTIALS.password}</shar:password>
    </ns:GetProductSellableRequest>
  </soap:Body>
</soap:Envelope>`;

  try {
    const responseXml = await callSoapProxy({
      endpoint: HIT_ENDPOINTS.productData,
      soapAction: 'getProductSellable',
      xmlBody,
    });
    
    return parseProductSellableResponse(responseXml);
  } catch (error) {
    console.error('Error fetching sellable products:', error);
    return [];
  }
}

// ============ PRICING AND CONFIGURATION SERVICE ============

export async function getConfigurationAndPricing(
  productId: string,
  partId?: string,
  quantity?: number
): Promise<ProductPricing | null> {
  const xmlBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
               xmlns:ns="http://www.promostandards.org/WSDL/PricingAndConfiguration/1.0.0/" 
               xmlns:shar="http://www.promostandards.org/WSDL/PricingAndConfiguration/1.0.0/SharedObjects/">
  <soap:Body>
    <ns:GetConfigurationAndPricingRequest>
      <shar:wsVersion>1.0.0</shar:wsVersion>
      <shar:id>${CREDENTIALS.id}</shar:id>
      <shar:password>${CREDENTIALS.password}</shar:password>
      <shar:productId>${productId}</shar:productId>
      ${partId ? `<shar:partId>${partId}</shar:partId>` : ''}
      <shar:currency>USD</shar:currency>
      <shar:fobId>1</shar:fobId>
      <shar:priceType>Net</shar:priceType>
      <shar:localizationCountry>US</shar:localizationCountry>
      <shar:localizationLanguage>en</shar:localizationLanguage>
      <shar:configurationType>Decorated</shar:configurationType>
    </ns:GetConfigurationAndPricingRequest>
  </soap:Body>
</soap:Envelope>`;

  try {
    const responseXml = await callSoapProxy({
      endpoint: HIT_ENDPOINTS.ppc,
      soapAction: 'getConfigurationAndPricing',
      xmlBody,
    });
    
    return parsePricingResponse(responseXml, productId, partId || '');
  } catch (error) {
    console.error('Error fetching pricing:', error);
    return null;
  }
}

export async function getAvailableLocations(productId: string): Promise<DecorationLocation[]> {
  const xmlBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
               xmlns:ns="http://www.promostandards.org/WSDL/PricingAndConfiguration/1.0.0/" 
               xmlns:shar="http://www.promostandards.org/WSDL/PricingAndConfiguration/1.0.0/SharedObjects/">
  <soap:Body>
    <ns:GetAvailableLocationsRequest>
      <shar:wsVersion>1.0.0</shar:wsVersion>
      <shar:id>${CREDENTIALS.id}</shar:id>
      <shar:password>${CREDENTIALS.password}</shar:password>
      <shar:productId>${productId}</shar:productId>
      <shar:localizationCountry>US</shar:localizationCountry>
      <shar:localizationLanguage>en</shar:localizationLanguage>
    </ns:GetAvailableLocationsRequest>
  </soap:Body>
</soap:Envelope>`;

  try {
    const responseXml = await callSoapProxy({
      endpoint: HIT_ENDPOINTS.ppc,
      soapAction: 'getAvailableLocations',
      xmlBody,
    });
    
    return parseLocationsResponse(responseXml);
  } catch (error) {
    console.error('Error fetching locations:', error);
    return [];
  }
}

export async function getAvailableCharges(productId: string): Promise<Charge[]> {
  const xmlBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
               xmlns:ns="http://www.promostandards.org/WSDL/PricingAndConfiguration/1.0.0/" 
               xmlns:shar="http://www.promostandards.org/WSDL/PricingAndConfiguration/1.0.0/SharedObjects/">
  <soap:Body>
    <ns:GetAvailableChargesRequest>
      <shar:wsVersion>1.0.0</shar:wsVersion>
      <shar:id>${CREDENTIALS.id}</shar:id>
      <shar:password>${CREDENTIALS.password}</shar:password>
      <shar:productId>${productId}</shar:productId>
      <shar:localizationCountry>US</shar:localizationCountry>
      <shar:localizationLanguage>en</shar:localizationLanguage>
    </ns:GetAvailableChargesRequest>
  </soap:Body>
</soap:Envelope>`;

  try {
    const responseXml = await callSoapProxy({
      endpoint: HIT_ENDPOINTS.ppc,
      soapAction: 'getAvailableCharges',
      xmlBody,
    });
    
    return parseChargesResponse(responseXml);
  } catch (error) {
    console.error('Error fetching charges:', error);
    return [];
  }
}

// ============ XML PARSING HELPERS ============

function extractValue(xml: string, tag: string): string | null {
  // Handle namespaced tags
  const patterns = [
    new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'),
    new RegExp(`<[^:]+:${tag}[^>]*>([^<]*)</[^:]+:${tag}>`, 'i'),
    new RegExp(`<ns\\d*:${tag}[^>]*>([^<]*)</ns\\d*:${tag}>`, 'i'),
  ];
  
  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

function extractAllValues(xml: string, tag: string): string[] {
  const values: string[] = [];
  const patterns = [
    new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'gi'),
    new RegExp(`<[^:]+:${tag}[^>]*>([^<]*)</[^:]+:${tag}>`, 'gi'),
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(xml)) !== null) {
      values.push(match[1].trim());
    }
  }
  return values;
}

function extractBlock(xml: string, tag: string): string | null {
  const patterns = [
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'),
    new RegExp(`<[^:]+:${tag}[^>]*>([\\s\\S]*?)</[^:]+:${tag}>`, 'i'),
  ];
  
  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function extractAllBlocks(xml: string, tag: string): string[] {
  const blocks: string[] = [];
  const patterns = [
    new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, 'gi'),
    new RegExp(`<[^:]+:${tag}[^>]*>[\\s\\S]*?</[^:]+:${tag}>`, 'gi'),
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(xml)) !== null) {
      blocks.push(match[0]);
    }
  }
  return blocks;
}

function parseProductResponse(xml: string): Product | null {
  const productBlock = extractBlock(xml, 'Product');
  if (!productBlock) return null;
  
  const productId = extractValue(productBlock, 'productId');
  const productName = extractValue(productBlock, 'productName');
  
  if (!productId || !productName) return null;
  
  // Parse parts
  const partBlocks = extractAllBlocks(productBlock, 'ProductPart');
  const parts: ProductPart[] = partBlocks.map(partXml => {
    const colors: string[] = [];
    const colorBlocks = extractAllBlocks(partXml, 'Color');
    colorBlocks.forEach(colorBlock => {
      const colorName = extractValue(colorBlock, 'colorName');
      if (colorName && !colors.includes(colorName)) {
        colors.push(colorName);
      }
    });
    
    return {
      partId: extractValue(partXml, 'partId') || '',
      description: extractValue(partXml, 'description') || undefined,
      colors,
      countryOfOrigin: extractValue(partXml, 'countryOfOrigin') || undefined,
      primaryColor: colors[0],
    };
  });
  
  // Get category info
  const categoryBlock = extractBlock(productBlock, 'ProductCategory');
  const category = categoryBlock ? extractValue(categoryBlock, 'category') || undefined : undefined;
  const subCategory = categoryBlock ? extractValue(categoryBlock, 'subCategory') || undefined : undefined;
  
  return {
    productId,
    productName,
    description: extractValue(productBlock, 'description') || undefined,
    category,
    subCategory,
    parts,
  };
}

function parseProductSellableResponse(xml: string): Array<{ productId: string; partId?: string }> {
  const products: Array<{ productId: string; partId?: string }> = [];
  const productBlocks = extractAllBlocks(xml, 'ProductSellable');
  
  productBlocks.forEach(block => {
    const productId = extractValue(block, 'productId');
    if (productId) {
      products.push({
        productId,
        partId: extractValue(block, 'partId') || undefined,
      });
    }
  });
  
  return products;
}

function parsePricingResponse(xml: string, productId: string, partId: string): ProductPricing | null {
  // Extract price breaks
  const priceBreaks: PriceBreak[] = [];
  const priceBlocks = extractAllBlocks(xml, 'Price');
  
  priceBlocks.forEach(block => {
    const qty = extractValue(block, 'minQuantity') || extractValue(block, 'quantity');
    const price = extractValue(block, 'price');
    if (qty && price) {
      priceBreaks.push({
        quantity: parseInt(qty),
        price: parseFloat(price),
        discountCode: extractValue(block, 'discountCode') || undefined,
      });
    }
  });
  
  // Extract decoration locations
  const decorationLocations: DecorationLocation[] = [];
  const locationBlocks = extractAllBlocks(xml, 'Location');
  
  locationBlocks.forEach(locBlock => {
    const locationId = extractValue(locBlock, 'locationId');
    const locationName = extractValue(locBlock, 'locationName');
    
    if (locationId && locationName) {
      const methods: DecorationMethod[] = [];
      const methodBlocks = extractAllBlocks(locBlock, 'DecorationMethod');
      
      methodBlocks.forEach(methodBlock => {
        const decorationId = extractValue(methodBlock, 'decorationId');
        const decorationName = extractValue(methodBlock, 'decorationName');
        if (decorationId && decorationName) {
          methods.push({ decorationId, decorationName });
        }
      });
      
      decorationLocations.push({
        locationId,
        locationName,
        decorationMethods: methods,
        maxColors: parseInt(extractValue(locBlock, 'maxColors') || '0') || undefined,
      });
    }
  });
  
  // Extract FOB info
  const fobBlock = extractBlock(xml, 'Fob');
  const fobId = fobBlock ? extractValue(fobBlock, 'fobId') : undefined;
  const fobCity = fobBlock ? extractValue(fobBlock, 'fobCity') : undefined;
  const fobState = fobBlock ? extractValue(fobBlock, 'fobState') : undefined;
  
  return {
    productId,
    partId,
    currency: extractValue(xml, 'currency') || 'USD',
    fobId: fobId || undefined,
    fobCity: fobCity || undefined,
    fobState: fobState || undefined,
    priceBreaks: priceBreaks.sort((a, b) => a.quantity - b.quantity),
    charges: [],
    decorationLocations,
  };
}

function parseLocationsResponse(xml: string): DecorationLocation[] {
  const locations: DecorationLocation[] = [];
  const locationBlocks = extractAllBlocks(xml, 'AvailableLocation');
  
  locationBlocks.forEach(locBlock => {
    const locationId = extractValue(locBlock, 'locationId');
    const locationName = extractValue(locBlock, 'locationName');
    
    if (locationId && locationName) {
      const methods: DecorationMethod[] = [];
      const methodBlocks = extractAllBlocks(locBlock, 'DecorationMethod');
      
      methodBlocks.forEach(methodBlock => {
        const decorationId = extractValue(methodBlock, 'decorationId');
        const decorationName = extractValue(methodBlock, 'decorationName');
        if (decorationId && decorationName) {
          methods.push({ decorationId, decorationName });
        }
      });
      
      locations.push({
        locationId,
        locationName,
        decorationMethods: methods,
      });
    }
  });
  
  return locations;
}

function parseChargesResponse(xml: string): Charge[] {
  const charges: Charge[] = [];
  const chargeBlocks = extractAllBlocks(xml, 'AvailableCharge');
  
  chargeBlocks.forEach(chargeBlock => {
    const chargeId = extractValue(chargeBlock, 'chargeId');
    const chargeName = extractValue(chargeBlock, 'chargeName');
    const chargeType = extractValue(chargeBlock, 'chargeType');
    
    if (chargeId && chargeName && chargeType) {
      const priceBreaks: PriceBreak[] = [];
      const priceBlocks = extractAllBlocks(chargeBlock, 'Price');
      
      priceBlocks.forEach(priceBlock => {
        const qty = extractValue(priceBlock, 'xMinQty') || extractValue(priceBlock, 'minQuantity');
        const price = extractValue(priceBlock, 'price');
        if (qty && price) {
          priceBreaks.push({
            quantity: parseInt(qty),
            price: parseFloat(price),
          });
        }
      });
      
      charges.push({
        chargeId,
        chargeName,
        chargeType,
        chargeDescription: extractValue(chargeBlock, 'chargeDescription') || undefined,
        priceBreaks,
      });
    }
  });
  
  return charges;
}

export { HIT_ENDPOINTS, CREDENTIALS };
