interface DetectionCardParams {
    owner: string;
    task: string;
    deadline: string;
    commitmentId: string;
    confidence: string; // e.g. "High" | "Medium" | "Low" or "0.92"
    gifUrl?: string;    // optional animated GIF
}

// Map confidence to a visual bar + emoji
const confidenceMeter = (confidence: string) => {
    const num = parseFloat(confidence);
    let level: number;

    if (!isNaN(num)) {
        level = num <= 1 ? num : num / 100; // handle 0.92 or 92
    } else {
        level = { high: 0.9, medium: 0.6, low: 0.3 }[confidence.toLowerCase()] ?? 0.5;
    }

    const filled = Math.round(level * 5);
    const bar = "🟩".repeat(filled) + "⬜".repeat(5 - filled);
    const label = level >= 0.75 ? "High" : level >= 0.5 ? "Medium" : "Low";
    return `${bar}  *${label}*`;
};

export const detectionCard = ({
    owner,
    task,
    deadline,
    commitmentId,
    confidence,
    gifUrl,
}: DetectionCardParams) => {
    const blocks: any[] = [
        {
            type: "header",
            text: { type: "plain_text", text: "🎯 New Commitment Detected", emoji: true },
        },
        {
            // fields render in a tidy two-column grid
            type: "section",
            fields: [
                { type: "mrkdwn", text: `*👤 Who*\n<@${owner}>` },
                { type: "mrkdwn", text: `*📌 What*\n${task}` },
                { type: "mrkdwn", text: `*🗓️ When*\n${deadline}` },
                { type: "mrkdwn", text: `*📊 Confidence*\n${confidenceMeter(confidence)}` },
            ],
        },
    ];

    // Optional animated GIF (auto-plays if it's a real .gif URL)
    if (gifUrl) {
        blocks.push({
            type: "image",
            image_url: gifUrl,
            alt_text: "commitment",
        });
    }

    blocks.push(
        { type: "divider" },
        {
            type: "actions",
            elements: [
                { type: "button", text: { type: "plain_text", text: "✅ Confirm", emoji: true }, style: "primary", action_id: "commitment_confirm", value: commitmentId },
                { type: "button", text: { type: "plain_text", text: "✏️ Edit", emoji: true }, action_id: "commitment_edit", value: commitmentId },
                { type: "button", text: { type: "plain_text", text: "❌ Dismiss", emoji: true }, style: "danger", action_id: "commitment_dismiss", value: commitmentId },
            ],
        },
    );

    return { blocks };
};
