import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import { query } from '../db/pool.js';
import { logger } from '../lib/logger.js';
import { sendEmail } from '../lib/email.js';
import { callGroq } from '../lib/groq.js';

interface Commitment {
  id: string;
  slack_message_ts: string;
  channel_id: string;
  owner_id: string;
  task_description: string;
  deadline: string | null;
  status: string;
  reminded_at: string | null;
  created_at: string;
}

const server = new Server(
  {
    name: 'Amnesia Agent',
    version: '1.0.0',
  },
  {
    capabilities: { tools: {} },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_all_commitments',
      description: 'List ALL commitments across all users, optionally filtered by status',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: 'Filter by status: pending, confirmed, completed, cancelled',
          },
        },
      },
    },
    {
      name: 'list_active_commitments',
      description: 'List all confirmed commitments for a Slack user',
      inputSchema: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            description: 'The Slack user ID',
          },
        },
        required: ['userId'],
      },
    },
    {
      name: 'generate_boilerplate',
      description: 'Generate starter code for a committed task',
      inputSchema: {
        type: 'object',
        properties: {
          commitmentId: {
            type: 'string',
            description: 'UUID of the commitment',
          },
          language: {
            type: 'string',
            description: 'Programming language for the boilerplate',
          },
        },
        required: ['commitmentId', 'language'],
      },
    },
    {
      name: 'draft_completion_email',
      description: 'Draft an email notification for a finished task using AI',
      inputSchema: {
        type: 'object',
        properties: {
          commitmentId: {
            type: 'string',
            description: 'UUID of the commitment',
          },
          to: {
            type: 'string',
            description: 'The recipient email address',
          },
        },
        required: ['commitmentId', 'to'],
      },
    },
    {
      name: 'search_messages',
      description:
        'Search Slack messages using Real-Time Search API — find past commitments, context, or relevant conversations',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query (e.g., "deadline", "finish report", "deploy")',
          },
          channel: {
            type: 'string',
            description: 'Optional: restrict search to a specific channel ID',
          },
          count: {
            type: 'number',
            description: 'Number of results (default: 5, max: 20)',
          },
        },
        required: ['query'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'list_all_commitments':
      return handleListAll(args as { status?: string });
    case 'list_active_commitments':
      return handleListActive(args as { userId: string });
    case 'generate_boilerplate':
      return handleGenerateBoilerplate(args as { commitmentId: string; language?: string });
    case 'draft_completion_email':
      return handleDraftCompletionEmail(args as { commitmentId: string; to: string });
    case 'search_messages':
      return handleSearchMessages(args as { query: string; channel?: string; count?: number });
    default:
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }
});

async function handleListAll(args: { status?: string }) {
  let sql = `SELECT * FROM commitments`;
  const params: string[] = [];

  if (args?.status) {
    sql += ` WHERE status = $1`;
    params.push(args.status);
  }

  sql += ` ORDER BY created_at DESC`;

  const result = await query<Commitment>(sql, params.length ? params : undefined);

  logger.info({ count: result.rows.length, status: args?.status }, 'Listed all commitments');

  if (result.rows.length === 0) {
    return {
      content: [{ type: 'text', text: 'No commitments found.' }],
    };
  }

  const lines = result.rows.map((c) => {
    const due = c.deadline ? `due ${c.deadline}` : 'no deadline';
    return `- [${c.id}] ${c.task_description} (${due}) — user: ${c.owner_id} — status: ${c.status}`;
  });

  return {
    content: [
      {
        type: 'text',
        text: `Commitments (${result.rows.length}):\n${lines.join('\n')}`,
      },
    ],
  };
}

async function handleListActive(args: { userId: string }) {
  if (!args?.userId) {
    throw new McpError(ErrorCode.InvalidParams, 'userId is required');
  }

  const result = await query<Commitment>(
    `SELECT * FROM commitments
     WHERE owner_id = $1 AND status = 'confirmed'
     ORDER BY deadline ASC NULLS LAST`,
    [args.userId],
  );

  logger.info({ userId: args.userId, count: result.rows.length }, 'Listed commitments');

  if (result.rows.length === 0) {
    return {
      content: [{ type: 'text', text: 'No active commitments found.' }],
    };
  }

  const lines = result.rows.map((c) => {
    const due = c.deadline ? `due ${c.deadline}` : 'no deadline';
    return `- [${c.id}] ${c.task_description} (${due})`;
  });

  return {
    content: [
      {
        type: 'text',
        text: `Active commitments:\n${lines.join('\n')}`,
      },
    ],
  };
}

async function handleGenerateBoilerplate(args: { commitmentId: string; language?: string }) {
  if (!args?.commitmentId) {
    throw new McpError(ErrorCode.InvalidParams, 'commitmentId is required');
  }

  const result = await query<Commitment>(`SELECT * FROM commitments WHERE id = $1`, [
    args.commitmentId,
  ]);

  if (result.rows.length === 0) {
    throw new McpError(ErrorCode.InvalidParams, 'Commitment not found');
  }

  const task = result.rows[0].task_description;
  const lang = args.language ?? 'typescript';

  const code =
    (await callGroq({
      system: `You generate starter ${lang} boilerplate code. Return ONLY the code block.`,
      user: `Generate ${lang} starter code for this task: "${task}"`,
    })) || '// Could not generate boilerplate';

  logger.info({ commitmentId: args.commitmentId, lang }, 'Generated boilerplate');

  return {
    content: [
      {
        type: 'text',
        text: `Generated ${lang} boilerplate for: ${task}\n\n${code}`,
      },
    ],
  };
}

async function handleDraftCompletionEmail(args: { commitmentId: string; to: string }) {
  if (!args?.commitmentId || !args?.to) {
    throw new McpError(ErrorCode.InvalidParams, 'commitmentId and to are required');
  }

  const result = await query<Commitment>(`SELECT * FROM commitments WHERE id = $1`, [
    args.commitmentId,
  ]);

  if (result.rows.length === 0) {
    throw new McpError(ErrorCode.InvalidParams, 'Commitment not found');
  }

  const task = result.rows[0].task_description;

  const draft = await callGroq({
    system: 'You write short, professional completion emails. Return only the email body.',
    user: `Write a brief email telling the recipient that this task is finished: "${task}"`,
    temperature: 0.5,
  });

  const body = draft || `The task "${task}" has been completed.`;
  const subject = `Task completed: ${task}`;

  await sendEmail({ to: args.to, subject, body });

  logger.info({ commitmentId: args.commitmentId, to: args.to }, 'Completion email sent');

  return {
    content: [
      {
        type: 'text',
        text: `Completion email sent to ${args.to}.`,
      },
    ],
  };
}

async function handleSearchMessages(args: { query: string; channel?: string; count?: number }) {
  if (!args?.query) {
    throw new McpError(ErrorCode.InvalidParams, 'query is required');
  }

  const count = Math.min(args.count ?? 5, 20);
  const token = process.env.SLACK_BOT_TOKEN;

  if (!token) {
    throw new McpError(ErrorCode.InternalError, 'SLACK_BOT_TOKEN not configured');
  }

  try {
    // First, search our own database for matching commitments
    const dbResult = await query<Commitment>(
      `SELECT * FROM commitments WHERE task_description ILIKE $1 ORDER BY created_at DESC LIMIT $2`,
      [`%${args.query}%`, count],
    );

    const dbLines = dbResult.rows.map((c) => {
      const due = c.deadline ? `due ${new Date(c.deadline).toLocaleString()}` : 'no deadline';
      return `- [DB] ${c.task_description} (${due}) — <@${c.owner_id}> — status: ${c.status}`;
    });

    // Also search Slack messages in the channel using conversations.history
    let slackLines: string[] = [];
    if (args.channel) {
      const historyParams = new URLSearchParams({
        channel: args.channel,
        limit: String(count),
      });

      const response = await fetch(
        `https://slack.com/api/conversations.history?${historyParams.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const data: any = await response.json();

      if (data.ok && data.messages) {
        // Filter messages matching the query
        const queryLower = args.query.toLowerCase();
        const matches = data.messages.filter((m: any) =>
          m.text?.toLowerCase().includes(queryLower),
        );

        slackLines = matches.map((m: any) => {
          const user = m.user || 'unknown';
          const text = m.text?.substring(0, 120) || '(no text)';
          const ts = m.ts ? new Date(parseFloat(m.ts) * 1000).toLocaleString() : '';
          return `- [Slack] <@${user}> (${ts}): ${text}`;
        });
      }
    }

    const allLines = [...dbLines, ...slackLines];

    if (allLines.length === 0) {
      return {
        content: [{ type: 'text', text: `No commitments or messages found for "${args.query}".` }],
      };
    }

    logger.info({ query: args.query, results: allLines.length }, 'Search completed');

    return {
      content: [
        {
          type: 'text',
          text: `Found ${allLines.length} result(s) for "${args.query}":\n\n${allLines.join('\n')}`,
        },
      ],
    };
  } catch (error: any) {
    if (error instanceof McpError) throw error;
    logger.error({ error }, 'Search messages failed');
    throw new McpError(ErrorCode.InternalError, `Search failed: ${error.message}`);
  }
}

export async function startMcpServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('Amnesia Agent MCP server started');
}

// Auto-start only when this file is the entry point
const entryPath = process.argv[1]?.replace(/\\/g, '/') ?? '';
const isMain = entryPath.endsWith('mcp/server.ts') || entryPath.endsWith('mcp/server.js');
if (isMain) {
  startMcpServer().catch((error) => {
    logger.error({ error }, 'Server failed to start');
    process.exit(1);
  });
}
