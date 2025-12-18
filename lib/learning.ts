import { LearningExample, LearningCorrection, LearningFeedback, LearningStats } from '../types';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

// Storage file paths (in production, use a database)
const DATA_DIR = join(process.cwd(), 'data');
const EXAMPLES_FILE = join(DATA_DIR, 'learning-examples.json');
const CORRECTIONS_FILE = join(DATA_DIR, 'learning-corrections.json');
const FEEDBACK_FILE = join(DATA_DIR, 'learning-feedback.json');

// Ensure data directory exists
function ensureDataDir() {
  if (typeof window === 'undefined') {
    const fs = require('fs');
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }
}

// Generate unique ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Load data from file
function loadData<T>(filePath: string, defaultValue: T[]): T[] {
  try {
    ensureDataDir();
    if (existsSync(filePath)) {
      const data = readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error(`Error loading ${filePath}:`, error);
  }
  return defaultValue;
}

// Save data to file
function saveData<T>(filePath: string, data: T[]): void {
  try {
    ensureDataDir();
    writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error saving ${filePath}:`, error);
  }
}

// ============ Examples Management ============

export function getExamples(): LearningExample[] {
  return loadData<LearningExample>(EXAMPLES_FILE, []);
}

export function addExample(example: Omit<LearningExample, 'id' | 'createdAt' | 'lastUsedAt' | 'usageCount'>): LearningExample {
  const examples = getExamples();

  // Check if similar example already exists
  const existing = examples.find(e =>
    e.userInput.toLowerCase() === example.userInput.toLowerCase() &&
    e.type === example.type
  );

  if (existing) {
    // Update existing example
    existing.usageCount++;
    existing.lastUsedAt = new Date().toISOString();
    existing.confidence = Math.min(1, existing.confidence + 0.1); // Increase confidence
    saveData(EXAMPLES_FILE, examples);
    return existing;
  }

  // Add new example
  const newExample: LearningExample = {
    ...example,
    id: generateId(),
    usageCount: 1,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  };

  examples.push(newExample);
  saveData(EXAMPLES_FILE, examples);
  return newExample;
}

export function findSimilarExamples(
  userInput: string,
  type?: LearningExample['type'],
  limit: number = 5
): LearningExample[] {
  const examples = getExamples();
  const inputLower = userInput.toLowerCase().trim();
  const inputWords = inputLower.split(/\s+/);

  // Score each example by relevance
  const scored = examples
    .filter(e => !type || e.type === type)
    .map(example => {
      const exampleLower = example.userInput.toLowerCase();
      const exampleWords = exampleLower.split(/\s+/);

      let score = 0;

      // Exact match
      if (exampleLower === inputLower) {
        score = 100;
      }
      // Contains match
      else if (inputLower.includes(exampleLower) || exampleLower.includes(inputLower)) {
        score = 50;
      }
      // Word overlap
      else {
        const commonWords = inputWords.filter(w => exampleWords.includes(w));
        score = (commonWords.length / Math.max(inputWords.length, exampleWords.length)) * 30;
      }

      // Boost by confidence and usage
      score *= example.confidence;
      score += Math.min(example.usageCount * 2, 20); // Cap usage bonus

      return { example, score };
    })
    .filter(({ score }) => score > 5) // Minimum relevance threshold
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ example }) => example);
}

// ============ Corrections Management ============

export function getCorrections(): LearningCorrection[] {
  return loadData<LearningCorrection>(CORRECTIONS_FILE, []);
}

export function addCorrection(correction: Omit<LearningCorrection, 'id' | 'createdAt'>): LearningCorrection {
  const corrections = getCorrections();

  const newCorrection: LearningCorrection = {
    ...correction,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };

  corrections.push(newCorrection);
  saveData(CORRECTIONS_FILE, corrections);

  // Also add as a high-confidence example
  addExample({
    type: correction.field === 'color' ? 'color' :
          correction.field === 'decorationMethod' ? 'decoration' :
          correction.field === 'decorationLocation' ? 'location' :
          correction.field === 'quantity' ? 'quantity' : 'parsing',
    userInput: correction.userInput,
    matchedValue: correction.correctedValue,
    confidence: 0.9, // High confidence since user corrected it
  });

  return newCorrection;
}

export function findCorrection(userInput: string, field: string): LearningCorrection | null {
  const corrections = getCorrections();
  const inputLower = userInput.toLowerCase().trim();

  // Find exact or close match
  return corrections.find(c =>
    c.field === field &&
    c.userInput.toLowerCase().trim() === inputLower
  ) || null;
}

// ============ Feedback Management ============

export function getFeedback(): LearningFeedback[] {
  return loadData<LearningFeedback>(FEEDBACK_FILE, []);
}

export function addFeedback(feedback: Omit<LearningFeedback, 'timestamp'>): void {
  const feedbackList = getFeedback();

  const newFeedback: LearningFeedback = {
    ...feedback,
    timestamp: new Date().toISOString(),
  };

  feedbackList.push(newFeedback);
  saveData(FEEDBACK_FILE, feedbackList);

  // If positive feedback, add as examples
  if (feedback.wasCorrect) {
    for (const [field, value] of Object.entries(feedback.selections)) {
      if (value && typeof value === 'string') {
        addExample({
          type: field === 'partId' || field === 'color' ? 'color' :
                field === 'decorationMethod' ? 'decoration' :
                field === 'decorationLocation' ? 'location' :
                field === 'quantity' ? 'quantity' : 'parsing',
          userInput: feedback.userInput,
          matchedValue: value,
          confidence: 0.8,
        });
      }
    }
  }

  // If correction provided, add it
  if (feedback.correction) {
    addCorrection({
      userInput: feedback.userInput,
      originalMatch: feedback.correction.wrongValue,
      correctedValue: feedback.correction.correctValue,
      field: feedback.correction.field as LearningCorrection['field'],
    });
  }
}

// ============ Statistics ============

export function getStats(): LearningStats {
  const examples = getExamples();
  const corrections = getCorrections();
  const feedback = getFeedback();

  const correctCount = feedback.filter(f => f.wasCorrect).length;
  const totalFeedback = feedback.length;

  // Count patterns
  const patternCounts = new Map<string, number>();
  for (const example of examples) {
    const pattern = `${example.type}: "${example.userInput}" → ${example.matchedValue}`;
    patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + example.usageCount);
  }

  const topPatterns = Array.from(patternCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([pattern, count]) => ({ pattern, count }));

  return {
    totalExamples: examples.length,
    totalCorrections: corrections.length,
    accuracyRate: totalFeedback > 0 ? correctCount / totalFeedback : 1,
    topPatterns,
  };
}

// ============ Prompt Enhancement ============

export function getExamplesForPrompt(
  userInput: string,
  type?: LearningExample['type'],
  maxExamples: number = 5
): string {
  const examples = findSimilarExamples(userInput, type, maxExamples);
  const corrections = getCorrections().slice(-10); // Recent corrections

  if (examples.length === 0 && corrections.length === 0) {
    return '';
  }

  let prompt = '\n\nLEARNED PATTERNS (from previous interactions):\n';

  if (examples.length > 0) {
    prompt += 'Successful matches:\n';
    for (const ex of examples) {
      prompt += `- "${ex.userInput}" → ${ex.matchedValue} (used ${ex.usageCount}x)\n`;
    }
  }

  // Add relevant corrections
  const relevantCorrections = corrections.filter(c => {
    const inputLower = userInput.toLowerCase();
    const corrInputLower = c.userInput.toLowerCase();
    return inputLower.includes(corrInputLower) || corrInputLower.includes(inputLower);
  });

  if (relevantCorrections.length > 0) {
    prompt += '\nUser corrections:\n';
    for (const corr of relevantCorrections) {
      prompt += `- "${corr.userInput}" should be ${corr.field}: ${corr.correctedValue}`;
      if (corr.originalMatch) {
        prompt += ` (NOT ${corr.originalMatch})`;
      }
      prompt += '\n';
    }
  }

  return prompt;
}

// ============ Quick Match ============

// Try to match user input using learned examples before AI
export function tryLearnedMatch(
  userInput: string,
  field: 'color' | 'decorationMethod' | 'decorationLocation' | 'decorationColors'
): string | number | null {
  const inputLower = userInput.toLowerCase().trim();

  // First check corrections (highest priority)
  const correction = findCorrection(userInput, field);
  if (correction) {
    console.log(`Learning: Found correction for "${userInput}" → ${correction.correctedValue}`);
    return correction.correctedValue;
  }

  // Then check high-confidence examples
  const type = field === 'color' ? 'color' :
               field === 'decorationMethod' ? 'decoration' :
               field === 'decorationLocation' ? 'location' : 'quantity';

  const examples = findSimilarExamples(userInput, type, 3);
  const bestMatch = examples.find(e =>
    e.confidence >= 0.7 &&
    e.userInput.toLowerCase() === inputLower
  );

  if (bestMatch) {
    console.log(`Learning: Found example match for "${userInput}" → ${bestMatch.matchedValue}`);
    // Update usage
    addExample({
      type: bestMatch.type,
      userInput: bestMatch.userInput,
      matchedValue: bestMatch.matchedValue,
      confidence: bestMatch.confidence,
    });

    if (field === 'decorationColors') {
      return parseInt(bestMatch.matchedValue, 10);
    }
    return bestMatch.matchedValue;
  }

  return null;
}
