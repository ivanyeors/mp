// General → API configurations. Empty by default, as on a new site. The
// `claude-key` scenario has a Claude API key saved, so the Claude API key
// card, the table's Claude row and AI writing's status show the saved state.
// The key is made up and never leaves the preview.

export default function settings({ scenario, now }) {
  if (scenario !== "claude-key") return {};
  return {
    tables: {
      api_configs: [
        {
          id: "00000000-0000-4000-8000-00000000c1a0",
          slug: "anthropic",
          name: "Claude (Anthropic)",
          base_url: "https://api.anthropic.com",
          api_key: "sk-ant-preview-not-a-real-key-0000",
          config: {},
          is_active: true,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        },
      ],
    },
  };
}
