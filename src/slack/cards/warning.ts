interface WarningCardParams {
  owner: string;
  task: string;
  deadline: string;
  hoursLeft: number;
  commitmentId: string;
}

export const warningCard = ({
  owner,
  task,
  deadline,
  hoursLeft,
  commitmentId,
}: WarningCardParams) => {
  return {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "⚠️ Deadline Approaching",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Who:* <@${owner}>\n*What:* ${task}\n*Deadline:* ${deadline}\n*Time Left:* ${hoursLeft} hours`,
        },
      },
      {
        type: "divider",
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "✅ Mark Complete",
              emoji: true,
            },
            style: "primary",
            action_id: "commitment_complete",
            value: commitmentId,
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "⏰ Snooze 1hr",
              emoji: true,
            },
            action_id: "commitment_snooze",
            value: commitmentId,
          },
        ],
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `ID: \`${commitmentId}\``,
          },
        ],
      },
    ],
  };
};
