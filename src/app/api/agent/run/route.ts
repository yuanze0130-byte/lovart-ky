import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/require-user';
import type { AgentRunRequest, AgentRunResponse } from '@/lib/agent/actions';
import { parseAgentCommand } from '@/lib/agent/parseAgentCommand';
import { executeAgentAction } from '@/lib/agent/executeAgentAction';

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const body = (await request.json()) as AgentRunRequest;

    if (!body?.message || typeof body.message !== 'string') {
      return NextResponse.json<AgentRunResponse>({ ok: false, error: 'Missing agent message' }, { status: 400 });
    }

    if (!body?.context || typeof body.context !== 'object') {
      return NextResponse.json<AgentRunResponse>({ ok: false, error: 'Missing agent context' }, { status: 400 });
    }

    const action = await parseAgentCommand({
      message: body.message,
      context: body.context,
      userId: user.id,
    });

    const result = await executeAgentAction({
      request,
      userId: user.id,
      action,
      context: body.context,
    });

    return NextResponse.json<AgentRunResponse>({
      ok: true,
      action,
      result,
    });
  } catch (error) {
    return NextResponse.json<AgentRunResponse>(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown agent error',
      },
      { status: 500 },
    );
  }
}
