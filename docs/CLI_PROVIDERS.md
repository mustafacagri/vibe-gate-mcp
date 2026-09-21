# Local CLI Providers

Vibe-Gate can use a supported coding CLI as the Critic. This lets you use an account already signed in to that CLI without adding a separate provider API key to Vibe-Gate.

The CLI is installed locally, but its model request still goes to the provider. Subscription limits, account permissions, provider terms, and data settings continue to apply. This is not offline inference and does not bypass usage limits.

## Supported CLIs

| `CRITIC_PROVIDER` | Command        | Sign in                                        | Model selection                                    |
| ----------------- | -------------- | ---------------------------------------------- | -------------------------------------------------- |
| `codex-cli`       | `codex`        | `codex login`                                  | Optional `CRITIC_MODEL`                            |
| `claude-code`     | `claude`       | `claude auth login`                            | Optional `CRITIC_MODEL`                            |
| `cursor-agent`    | `cursor-agent` | `cursor-agent login`                           | Optional `CRITIC_MODEL`                            |
| `opencode-cli`    | `opencode`     | `opencode auth login` or `/connect` in its TUI | Required `CRITIC_MODEL` in `provider/model` format |

If `CRITIC_MODEL` is omitted, Vibe-Gate leaves model selection to Codex, Claude Code, or Cursor Agent. Use model IDs accepted by the selected CLI when setting an override. Codex is deliberately started with user configuration ignored, so it uses its built-in default model rather than a custom model from `config.toml`; the saved login remains available. OpenCode CLI requires `CRITIC_MODEL` because Vibe-Gate isolates its user configuration.

### Codex CLI

Install Codex CLI and sign in with the account you want to use. Codex CLI supports ChatGPT sign-in as well as API-key sign-in; Vibe-Gate invokes the saved CLI session and removes common provider API-key variables from the child process environment.

```env
CRITIC_PROVIDER=codex-cli
# Optional when PATH in the IDE differs from your terminal:
# CODEX_CLI_PATH=/absolute/path/to/codex
# Optional model override:
# CRITIC_MODEL=gpt-5.4
```

Codex runs with its `read-only` sandbox, ephemeral session storage, user config ignored, and a temporary working directory. If the built-in model differs from the one you normally use, set `CRITIC_MODEL` explicitly. See the official [Codex authentication](https://developers.openai.com/es-419/docs/auth) and [non-interactive mode](https://developers.openai.com/es-419/docs/non-interactive-mode) guides.

### Claude Code

Install Claude Code and sign in with the account you want to use. For subscription use, sign in with a Claude plan that includes Claude Code; Console/API authentication may use API billing instead.

```env
CRITIC_PROVIDER=claude-code
# Optional when PATH in the IDE differs from your terminal:
# CLAUDE_CODE_CLI_PATH=/absolute/path/to/claude
# Optional model override:
# CRITIC_MODEL=sonnet
```

Vibe-Gate uses print mode and safe mode, disables built-in tools and MCP tools, selects plan mode, disables session persistence, and runs from a temporary directory. It removes `ANTHROPIC_API_KEY` so a provider API key cannot override Claude account authentication. If `ANTHROPIC_AUTH_TOKEN` is already set, Vibe-Gate passes it only to Claude Code because Claude Code uses it as a custom bearer authorization value; other CLI providers never receive it. These flags are compatible with the locally installed Claude Code 2.1.217 CLI; no newer `--restricted` option is required. See [Claude Code setup](https://code.claude.com/docs/en/getting-started), the [CLI reference](https://code.claude.com/docs/en/cli-usage), and [environment variable reference](https://code.claude.com/docs/en/env-vars).

### Cursor Agent

Install Cursor CLI and sign in to your Cursor account:

```sh
cursor-agent login
cursor-agent status
```

Then configure Vibe-Gate:

```env
CRITIC_PROVIDER=cursor-agent
# Optional when PATH in the IDE differs from your terminal:
# CURSOR_AGENT_CLI_PATH=/absolute/path/to/cursor-agent
# Optional model override:
# CRITIC_MODEL=gpt-5
```

Vibe-Gate runs print mode in Cursor's read-only `ask` mode from a temporary directory, passes `--trust` for that Vibe-Gate-created directory, and supplies a temporary Cursor CLI policy that denies shell, file-read, and file-write tools. It does not pass `--force`. Cursor may still load MCP servers from its user-level configuration; disable any such servers before selecting `cursor-agent` if you do not want them available to the review agent. Cursor does not expose a no-session-persistence flag in its current CLI reference, so its normal session history may retain the prompt. See the [Cursor CLI overview](https://cursor.com/docs/cli/overview), [authentication](https://docs.cursor.com/en/cli/reference/authentication), [output format](https://docs.cursor.com/en/cli/reference/output-format), and [permissions](https://docs.cursor.com/cli/reference/permissions) documentation for current behavior.

### OpenCode CLI (`opencode-cli`)

Sign in through OpenCode's provider flow, then check saved credentials and available model IDs:

```sh
opencode auth login
opencode auth list
opencode models
```

Configure the `provider/model` ID shown by `opencode models`:

```env
CRITIC_PROVIDER=opencode-cli
CRITIC_MODEL=provider/model
# Optional when PATH in the IDE differs from your terminal:
# OPENCODE_CLI_PATH=/absolute/path/to/opencode
```

OpenCode CLI reuses its saved credential store; Vibe-Gate removes provider API-key environment variables before starting it. Vibe-Gate isolates OpenCode's user config and plugins, supplies a temporary config with all tools and MCP calls denied, and runs in a temporary directory. `opencode run` stores sessions in OpenCode's data directory, so Vibe-Gate deletes the exact session after each result. This CLI adapter is separate from `CRITIC_PROVIDER=opencode`, which calls Vibe-Gate's Zen/Go HTTP provider and requires `OPENCODE_API_KEY`. Saved credentials still follow their own account, provider terms, and billing limits. See [OpenCode providers and saved credentials](https://opencode.ai/docs/providers), [OpenCode CLI](https://dev.opencode.ai/docs/cli/), [configuration](https://dev.opencode.ai/docs/config/), and [permissions](https://dev.opencode.ai/docs/permissions/).

## MCP configuration example

The same configuration works with every CLI provider ID. The MCP process and CLI must run on the same machine and as the same OS user that owns the CLI login.

```json
{
  "mcpServers": {
    "vibe-gate": {
      "command": "npx",
      "args": ["-y", "vibe-gate-mcp"],
      "env": {
        "VIBE_WORKSPACE_ROOT": "${workspaceFolder}",
        "CRITIC_PROVIDER": "codex-cli"
      }
    }
  }
}
```

For an API provider, keep its key in MCP `env` or a local `.env` as described in [INSTALLATION.md](INSTALLATION.md). For a CLI provider, do not add an API key. Provider API-key variables in the MCP process are intentionally removed before starting the CLI, to prefer the CLI's own signed-in account session. The Claude Code adapter passes `ANTHROPIC_AUTH_TOKEN` only to Claude Code when it is already set.

If the IDE cannot find the CLI, set the matching executable-path variable to its absolute path. You can also set `CRITIC_CLI_TIMEOUT_MS` from `1000` to `600000` milliseconds; the default is `120000`.

## What Vibe-Gate sends and how the process is constrained

- Vibe-Gate passes the review instructions, report, and changed-code context to the selected CLI through standard input. The selected model provider processes that content under its account's service and privacy settings.
- Each CLI starts in a new temporary working directory. Vibe-Gate removes that directory after the response or an error.
- Codex uses a read-only sandbox. Claude Code disables built-in and MCP tools. Cursor Agent gets a temporary deny policy for shell and file tools. OpenCode CLI uses a temporary configuration with all tools denied, disables plugins, and deletes its generated session.
- Provider API-key variables are removed from the CLI child environment. The CLI must already be installed and signed in; Vibe-Gate does not install CLIs or sign in on the user's behalf.
- A CLI provider is selected explicitly. Vibe-Gate does not automatically retry with a different provider or account.

These are CLI-level restrictions and temporary working-directory isolation. They do not form an OS-level security sandbox around all user files or the provider CLI itself. Users should keep their CLI versions current and review the provider's own permission, subscription, MCP, and privacy controls.

## Other CLI candidates evaluated

Other CLI candidates we researched but have not configured as Vibe-Gate providers:

| Candidate              | What we found                                                                                                                                                                   | Status                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Gemini CLI             | Google's Gemini CLI account entitlements changed in 2026; it remains relevant for enterprise and API-key use.                                                                   | Not selected because an account-based headless workflow has not been verified. |
| Amazon Q Developer CLI | Builder ID accounts can use Q in the terminal, and AWS documents subscription tiers. We have not confirmed a stable one-shot prompt/output interface suitable for this adapter. | Revisit if AWS documents a supported non-interactive interface.                |

References: [Google's Gemini CLI transition announcement](https://github.com/google-gemini/gemini-cli/discussions/27274); [Amazon Q Builder ID](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/getting-started-builderid.html) and [Q Developer Pro CLI setup](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/upgrade-to-pro.html).
