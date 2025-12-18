import { NextRequest, NextResponse } from 'next/server';

const HIT_CREDENTIALS = {
  username: "extendtech",
  password: "e8e1d66dfeefdf2f0f89f013dde032b9",
};

const HIT_ENDPOINTS = {
  productData: "https://ppds.hitpromo.net/productData?ws=1",
  ppc: "https://ppds.hitpromo.net/pricingAndConfiguration?ws=1",
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const productId = searchParams.get('productId') || '55900';
  const operation = searchParams.get('operation') || 'getFobPoints';

  const results: any = {
    productId,
    operation,
    timestamp: new Date().toISOString(),
  };

  try {
    if (operation === 'getFobPoints') {
      // Get FOB Points
      const fobEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetFobPointsRequest xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://www.promostandards.org/WSDL/PricingAndConfiguration/1.0.0/">
      <wsVersion xmlns="http://www.promostandards.org/WSDL/PricingAndConfiguration/1.0.0/SharedObjects/">1.0.0</wsVersion>
      <id xmlns="http://www.promostandards.org/WSDL/PricingAndConfiguration/1.0.0/SharedObjects/">${HIT_CREDENTIALS.username}</id>
      <password xmlns="http://www.promostandards.org/WSDL/PricingAndConfiguration/1.0.0/SharedObjects/">${HIT_CREDENTIALS.password}</password>
      <productId xmlns="http://www.promostandards.org/WSDL/PricingAndConfiguration/1.0.0/SharedObjects/">${productId}</productId>
      <localizationCountry xmlns="http://www.promostandards.org/WSDL/PricingAndConfiguration/1.0.0/SharedObjects/">US</localizationCountry>
      <localizationLanguage xmlns="http://www.promostandards.org/WSDL/PricingAndConfiguration/1.0.0/SharedObjects/">en</localizationLanguage>
    </GetFobPointsRequest>
  </soap:Body>
</soap:Envelope>`;

      results.request = {
        url: HIT_ENDPOINTS.ppc,
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "SOAPAction": '"getFobPoints"',
        },
        body: fobEnvelope,
      };

      const response = await fetch(HIT_ENDPOINTS.ppc, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "SOAPAction": '"getFobPoints"',
        },
        body: fobEnvelope,
      });

      const text = await response.text();
      results.response = {
        status: response.status,
        statusText: response.statusText,
        contentLength: text.length,
        rawXml: text,
      };

      // Extract fobId
      const fobIdMatch = text.match(/<[^>]*:fobId[^>]*>([^<]*)</i);
      if (fobIdMatch) {
        results.extractedFobId = fobIdMatch[1].trim();
      }

      // Extract all tag names
      const tagMatches = text.match(/<([a-zA-Z0-9:_]+)[\s>]/g);
      if (tagMatches) {
        results.foundTags = [...new Set(tagMatches.map(t => t.replace(/^<|\s|>$/g, '')))];
      }

    } else if (operation === 'getConfigurationAndPricing') {
      const fobId = searchParams.get('fobId') || '1';

      const configEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetConfigurationAndPricingRequest xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://www.promostandards.org/WSDL/PricingAndConfiguration/1.0.0/">
      <wsVersion xmlns="http://www.promostandards.org/WSDL/PricingAndConfiguration/1.0.0/SharedObjects/">1.0.0</wsVersion>
      <id xmlns="http://www.promostandards.org/WSDL/PricingAndConfiguration/1.0.0/SharedObjects/">${HIT_CREDENTIALS.username}</id>
      <password xmlns="http://www.promostandards.org/WSDL/PricingAndConfiguration/1.0.0/SharedObjects/">${HIT_CREDENTIALS.password}</password>
      <productId xmlns="http://www.promostandards.org/WSDL/PricingAndConfiguration/1.0.0/SharedObjects/">${productId}</productId>
      <currency xmlns="http://www.promostandards.org/WSDL/PricingAndConfiguration/1.0.0/SharedObjects/">USD</currency>
      <fobId xmlns="http://www.promostandards.org/WSDL/PricingAndConfiguration/1.0.0/SharedObjects/">${fobId}</fobId>
      <priceType xmlns="http://www.promostandards.org/WSDL/PricingAndConfiguration/1.0.0/SharedObjects/">Net</priceType>
      <localizationCountry xmlns="http://www.promostandards.org/WSDL/PricingAndConfiguration/1.0.0/SharedObjects/">US</localizationCountry>
      <localizationLanguage xmlns="http://www.promostandards.org/WSDL/PricingAndConfiguration/1.0.0/SharedObjects/">en</localizationLanguage>
      <configurationType xmlns="http://www.promostandards.org/WSDL/PricingAndConfiguration/1.0.0/SharedObjects/">Decorated</configurationType>
    </GetConfigurationAndPricingRequest>
  </soap:Body>
</soap:Envelope>`;

      results.request = {
        url: HIT_ENDPOINTS.ppc,
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "SOAPAction": '"getConfigurationAndPricing"',
        },
        body: configEnvelope,
      };

      const response = await fetch(HIT_ENDPOINTS.ppc, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "SOAPAction": '"getConfigurationAndPricing"',
        },
        body: configEnvelope,
      });

      const text = await response.text();
      results.response = {
        status: response.status,
        statusText: response.statusText,
        contentLength: text.length,
        rawXml: text,
      };

      // Extract all tag names
      const tagMatches = text.match(/<([a-zA-Z0-9:_]+)[\s>]/g);
      if (tagMatches) {
        results.foundTags = [...new Set(tagMatches.map(t => t.replace(/^<|\s|>$/g, '')))];
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    return NextResponse.json({
      ...results,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
