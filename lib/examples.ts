// Examples for few-shot learning - add new examples here to improve AI understanding
// The system will use these examples to better understand user intent

export interface ConversationExample {
  userInput: string;
  context: string; // What was being asked
  extracted: Record<string, any>;
  notes?: string; // Optional notes for why this extraction makes sense
}

// Initial request examples - extracting order details from natural language
export const initialRequestExamples: ConversationExample[] = [
  {
    userInput: "500 blue tumblers product 55900 with screen print",
    context: "initial order request",
    extracted: {
      quantity: 500,
      productId: "55900",
      color: "blue",
      decorationMethod: "screen print"
    }
  },
  {
    userInput: "I need 1000 of item #5790 in black, laser engraved on the front",
    context: "initial order request",
    extracted: {
      quantity: 1000,
      productId: "5790",
      color: "black",
      decorationMethod: "laser engrave",
      decorationLocation: "front"
    }
  },
  {
    userInput: "order 250 red pens",
    context: "initial order request",
    extracted: {
      quantity: 250,
      color: "red"
    },
    notes: "No product ID - will need to ask"
  },
  {
    userInput: "55900 qty 500",
    context: "initial order request",
    extracted: {
      quantity: 500,
      productId: "55900"
    }
  }
];

// Follow-up response examples - understanding answers to clarifying questions
export const followUpExamples: ConversationExample[] = [
  {
    userInput: "blue",
    context: "Asked about color, available: BLACK, BLUE, RED, WHITE",
    extracted: { color: "blue", partId: "match to BLUE" }
  },
  {
    userInput: "I'll take the black one",
    context: "Asked about color, available: BLACK, BLUE, RED",
    extracted: { color: "black", partId: "match to BLACK" }
  },
  {
    userInput: "screen print please",
    context: "Asked about decoration method, available: Screen Print, Laser Engrave",
    extracted: { decorationMethod: "Screen Print" }
  },
  {
    userInput: "silk screen on the front with 2 colors",
    context: "Asked about decoration, available methods: Screen Print, Pad Print; locations: FRONT, BACK, WRAP",
    extracted: {
      decorationMethod: "Screen Print",
      decorationLocation: "FRONT",
      decorationColors: 2
    },
    notes: "silk screen = screen print, extracted multiple fields from one answer"
  },
  {
    userInput: "wrap",
    context: "Asked about location, available: FRONT, BACK, WRAP",
    extracted: { decorationLocation: "WRAP" }
  },
  {
    userInput: "navy blue, screen printed on the wrap area",
    context: "Asked about color and decoration, colors: BLACK, NAVY BLUE, RED; methods: Screen Print; locations: WRAP",
    extracted: {
      color: "navy blue",
      partId: "match to NAVY BLUE",
      decorationMethod: "Screen Print",
      decorationLocation: "WRAP"
    },
    notes: "User answered multiple questions at once"
  },
  {
    userInput: "CB Drinkware",
    context: "Asked about decoration method, available: CB DRINKWARE SMALL, Laser Engrave",
    extracted: { decorationMethod: "CB DRINKWARE SMALL" },
    notes: "Partial match should work"
  },
  {
    userInput: "the first one",
    context: "Asked about color, available: BLACK, BLUE, RED (in that order)",
    extracted: { color: "BLACK" },
    notes: "Ordinal references should map to the list order"
  },
  {
    userInput: "2",
    context: "Asked about imprint colors, max: 4",
    extracted: { decorationColors: 2 }
  },
  {
    userInput: "full color",
    context: "Asked about imprint colors, max: 4",
    extracted: { decorationColors: 4 },
    notes: "full color typically means maximum colors"
  },
  {
    userInput: "one color imprint",
    context: "Asked about imprint colors",
    extracted: { decorationColors: 1 }
  }
];

// Format examples for inclusion in AI prompts
export function formatExamplesForPrompt(examples: ConversationExample[], limit: number = 5): string {
  const selected = examples.slice(0, limit);
  return selected.map(ex =>
    `Input: "${ex.userInput}"
Context: ${ex.context}
Extracted: ${JSON.stringify(ex.extracted)}${ex.notes ? `\nNote: ${ex.notes}` : ''}`
  ).join('\n\n');
}

// Common synonyms and variations for matching
export const synonyms: Record<string, string[]> = {
  "screen print": ["silk screen", "silkscreen", "screen printing", "screened"],
  "laser engrave": ["laser engraving", "lasered", "engraved", "etched"],
  "pad print": ["pad printing", "pad printed", "tampo"],
  "embroidery": ["embroidered", "embroider"],
  "front": ["front side", "face", "main"],
  "back": ["back side", "rear", "reverse"],
  "wrap": ["wraparound", "wrap around", "full wrap", "360"],
  "full color": ["4 color", "four color", "cmyk", "process"],
  "one color": ["1 color", "single color", "mono"],
};

// Helper to find synonym matches
export function findSynonymMatch(input: string, availableOptions: string[]): string | null {
  const normalized = input.toLowerCase().trim();

  // Direct match first
  const directMatch = availableOptions.find(opt =>
    opt.toLowerCase() === normalized ||
    opt.toLowerCase().includes(normalized) ||
    normalized.includes(opt.toLowerCase())
  );
  if (directMatch) return directMatch;

  // Try synonym matching
  for (const [canonical, variations] of Object.entries(synonyms)) {
    if (variations.some(v => normalized.includes(v.toLowerCase()))) {
      // Found a synonym, now find matching option
      const match = availableOptions.find(opt =>
        opt.toLowerCase().includes(canonical.toLowerCase())
      );
      if (match) return match;
    }
  }

  return null;
}
