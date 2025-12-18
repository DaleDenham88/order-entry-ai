import { NextRequest, NextResponse } from 'next/server';
import { addFeedback, addCorrection, getStats } from '@/lib/learning';
import { LearningFeedback, LearningCorrection } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, data } = body;

    switch (action) {
      case 'feedback': {
        // User confirming or correcting a selection
        const feedback: Omit<LearningFeedback, 'timestamp'> = {
          interactionId: data.interactionId || `int-${Date.now()}`,
          wasCorrect: data.wasCorrect,
          userInput: data.userInput,
          selections: data.selections,
          correction: data.correction,
        };
        addFeedback(feedback);
        return NextResponse.json({
          success: true,
          message: data.wasCorrect
            ? 'Thanks! This helps improve future responses.'
            : 'Thanks for the correction! I\'ll remember this.',
        });
      }

      case 'correction': {
        // Direct correction without full feedback
        const correction: Omit<LearningCorrection, 'id' | 'createdAt'> = {
          userInput: data.userInput,
          originalMatch: data.originalMatch,
          correctedValue: data.correctedValue,
          field: data.field,
        };
        addCorrection(correction);
        return NextResponse.json({
          success: true,
          message: 'Correction saved! I\'ll use this for future requests.',
        });
      }

      case 'stats': {
        // Get learning statistics
        const stats = getStats();
        return NextResponse.json({
          success: true,
          stats,
        });
      }

      default:
        return NextResponse.json({
          success: false,
          error: 'Unknown action',
        }, { status: 400 });
    }
  } catch (error) {
    console.error('Feedback API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    const stats = getStats();
    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('Feedback stats error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
