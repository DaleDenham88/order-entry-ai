import {
  PricingConfiguration,
  Part,
  Location,
  Decoration,
  Charge,
  ChargePrice,
  PartPrice,
} from "../types";

const HIT_CREDENTIALS = {
  username: "extendtech",
  password: "e8e1d66dfeefdf2f0f89f013dde032b9",
};

const HIT_ENDPOINTS = {
  productData: "https://ppds.hitpromo.net/productData?ws=1",
  ppc: "https://ppds.hitpromo.net/PPC?ws=1",
};

// Simple XML parser helpers
function extractValue(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<[^:]*:${tag}[^>]*>([^<]*)<`, "i");
  const match = xml.match(regex);
  return match ? match[1].trim() : undefined;
}

function extractAllBlocks(xml: string, tag: string): string[] {
  const blocks: string[] = [];
  const regex = new RegExp(
    `<[^:]*:${tag}[^>]*>([\\s\\S]*?)<\/[^:]*:${tag}>`,
    "gi"
  );
  let match;
  while ((match = regex.exec(xml)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

export async function getConfigurationAndPricing(
  productId: string
): Promise<PricingConfiguration> {
  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
               xmlns:ns="http://www.promostandards.org/WSDL/PricingAndConfiguration/1.0.0/">
  <soap:Body>
    <ns:GetConfigurationAndPricingRequest>
      <ns:wsVersion>1.0.0</ns:wsVersion>
      <ns:id>${HIT_CREDENTIALS.username}</ns:id>
      <ns:password>${HIT_CREDENTIALS.password}</ns:password>
      <ns:productId>${productId}</ns:productId>
      <ns:currency>USD</ns:currency>
    </ns:GetConfigurationAndPricingRequest>
  </soap:Body>
</soap:Envelope>`;

  const response = await fetch(HIT_ENDPOINTS.ppc, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "getConfigurationAndPricing",
    },
    body: soapEnvelope,
  });

  const xmlText = await response.text();
  console.log('SOAP Response length:', xmlText.length);
  const result = parseConfigurationResponse(xmlText, productId);
  console.log('Parsed parts count:', result.parts.length);
  console.log('Parsed locations count:', result.locations.length);
  if (result.parts.length > 0) {
    console.log('First part:', result.parts[0].partId, result.parts[0].partDescription);
  }
  return result;
}

function parseConfigurationResponse(
  xml: string,
  productId: string
): PricingConfiguration {
  const currency = extractValue(xml, "currency") || "USD";

  // Parse Parts
  const parts: Part[] = [];
  const partBlocks = extractAllBlocks(xml, "Part");

  for (const partBlock of partBlocks) {
    const partId = extractValue(partBlock, "partId");
    const partDescription = extractValue(partBlock, "partDescription") || "";

    if (partId) {
      const priceBreaks: PartPrice[] = [];
      const priceBlocks = extractAllBlocks(partBlock, "PartPrice");

      for (const priceBlock of priceBlocks) {
        const minQty = extractValue(priceBlock, "minQuantity");
        const price = extractValue(priceBlock, "price");
        const priceUom = extractValue(priceBlock, "priceUom") || "EA";

        if (minQty && price) {
          priceBreaks.push({
            minQuantity: parseInt(minQty),
            price: parseFloat(price),
            priceUom,
          });
        }
      }

      parts.push({
        partId,
        partDescription,
        priceBreaks: priceBreaks.sort((a, b) => a.minQuantity - b.minQuantity),
      });
    }
  }

  // Parse Locations
  const locations: Location[] = [];
  const locationBlocks = extractAllBlocks(xml, "Location");

  for (const locBlock of locationBlocks) {
    const locationId = extractValue(locBlock, "locationId");
    const locationName = extractValue(locBlock, "locationName");
    const defaultLocation =
      extractValue(locBlock, "defaultLocation") === "true";

    if (locationId && locationName) {
      const decorations: Decoration[] = [];
      const decorationBlocks = extractAllBlocks(locBlock, "Decoration");

      for (const decBlock of decorationBlocks) {
        const decorationId = extractValue(decBlock, "decorationId");
        const decorationName = extractValue(decBlock, "decorationName");
        const decorationGeometry =
          extractValue(decBlock, "decorationGeometry") || "";
        const decorationHeight = parseFloat(
          extractValue(decBlock, "decorationHeight") || "0"
        );
        const decorationWidth = parseFloat(
          extractValue(decBlock, "decorationWidth") || "0"
        );
        const decorationUom =
          extractValue(decBlock, "decorationUom") || "Inches";
        const decorationUnitsIncluded = parseInt(
          extractValue(decBlock, "decorationUnitsIncluded") || "0"
        );
        const decorationUnitsMax = parseInt(
          extractValue(decBlock, "decorationUnitsMax") || "1"
        );
        const defaultDecoration =
          extractValue(decBlock, "defaultDecoration") === "true";

        if (decorationId && decorationName) {
          const charges: Charge[] = [];
          const chargeBlocks = extractAllBlocks(decBlock, "Charge");

          for (const chargeBlock of chargeBlocks) {
            const chargeId = extractValue(chargeBlock, "chargeId");
            const chargeName = extractValue(chargeBlock, "chargeName");
            const chargeDescription =
              extractValue(chargeBlock, "chargeDescription") || "";
            const chargeType = extractValue(chargeBlock, "chargeType") as
              | "Setup"
              | "Run";

            if (chargeId && chargeName && chargeType) {
              const priceArray: ChargePrice[] = [];
              const chargePriceBlocks = extractAllBlocks(
                chargeBlock,
                "ChargePrice"
              );

              for (const chargePriceBlock of chargePriceBlocks) {
                const xMinQty = parseInt(
                  extractValue(chargePriceBlock, "xMinQty") || "1"
                );
                const xUom = extractValue(chargePriceBlock, "xUom") || "EA";
                const yMinQty = parseInt(
                  extractValue(chargePriceBlock, "yMinQty") || "1"
                );
                const yUom = extractValue(chargePriceBlock, "yUom") || "Colors";
                const price = parseFloat(
                  extractValue(chargePriceBlock, "price") || "0"
                );
                const repeatPrice = parseFloat(
                  extractValue(chargePriceBlock, "repeatPrice") || "0"
                );

                priceArray.push({
                  xMinQty,
                  xUom,
                  yMinQty,
                  yUom,
                  price,
                  repeatPrice,
                });
              }

              charges.push({
                chargeId,
                chargeName,
                chargeDescription,
                chargeType,
                priceArray,
              });
            }
          }

          decorations.push({
            decorationId,
            decorationName,
            decorationGeometry,
            decorationHeight,
            decorationWidth,
            decorationUom,
            decorationUnitsIncluded,
            decorationUnitsMax,
            defaultDecoration,
            charges,
          });
        }
      }

      locations.push({
        locationId,
        locationName,
        decorations,
        defaultLocation,
      });
    }
  }

  return {
    productId,
    currency,
    parts,
    locations,
  };
}

export async function getProductData(
  productId: string
): Promise<{ productName: string; description: string }> {
  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
               xmlns:ns="http://www.promostandards.org/WSDL/ProductDataService/1.0.0/">
  <soap:Body>
    <ns:GetProductRequest>
      <ns:wsVersion>1.0.0</ns:wsVersion>
      <ns:id>${HIT_CREDENTIALS.username}</ns:id>
      <ns:password>${HIT_CREDENTIALS.password}</ns:password>
      <ns:productId>${productId}</ns:productId>
    </ns:GetProductRequest>
  </soap:Body>
</soap:Envelope>`;

  const response = await fetch(HIT_ENDPOINTS.productData, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "getProduct",
    },
    body: soapEnvelope,
  });

  const xmlText = await response.text();

  return {
    productName: extractValue(xmlText, "productName") || "Unknown Product",
    description: extractValue(xmlText, "description") || "",
  };
}
