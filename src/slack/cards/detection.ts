interface DetectionCardParams {
    owner: string;
    task: string;
    deadline: string;
    commitmentId: string;
    confidence: string;
}

export const detectionCard = ({
    owner,
    task,
    deadline,
    commitmentId,
    confidence,
}: DetectionCardParams) => {
    return {
        blocks: [
            {
                type: "header",
                text: {
                    type: "plain_text",
                    text: "🎯 Commitment Detected",
                    emoji: true,
                },
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*Who:* <@${owner}>\n*What:* ${task}\n*When:* ${deadline}\n*Confidence:* ${confidence}`,
                },
            },
            {
                type: "actions",
                elements: [
                    { type: "button", text: { type: "plain_text", text: "✅ Confirm", emoji: true }, style: "primary", action_id: "commitment_confirm", value: commitmentId },
                    { type: "button", text: { type: "plain_text", text: "✏️ Edit", emoji: true }, action_id: "commitment_edit", value: commitmentId },
                    { type: "button", text: { type: "plain_text", text: "❌ Dismiss", emoji: true }, style: "danger", action_id: "commitment_dismiss", value: commitmentId },
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
