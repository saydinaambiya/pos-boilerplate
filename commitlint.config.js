/** @type {import("@commitlint/types").UserConfig} */
const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "trailer-exists": [0],
    "body-max-line-length": [2, "always", 100],
    "no-ai-coauthor": [2, "always"],
  },
  plugins: [
    {
      rules: {
        // Project policy: commits must not credit AI agents as co-authors.
        "no-ai-coauthor": ({ raw }) => {
          const pattern =
            /^co-authored-by:.*(claude|anthropic|copilot|openai|chatgpt|gemini|cursor|codeium)/im;
          return [!pattern.test(raw ?? ""), "AI agents must not be listed as co-authors"];
        },
      },
    },
  ],
};

export default config;
