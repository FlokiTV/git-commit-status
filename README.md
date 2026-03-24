# git-commit-status

A CLI utility to generate rankings and statistics (commits, lines of code changed, heatmaps) based on your project's Git history.

## How to use

> **Note:** You need to have [Bun](https://bun.sh/) installed on your machine to run this command.

Navigate to your Git project directory, open the terminal, and run the following command:

```bash
bunx github:FlokiTV/git-commit-status
```

### Optional Arguments

You can customize the script behavior using the following arguments:

- `--branch`: The branch to analyze (default: `main`)
- `--fileName`: The output markdown file name (default: `RANKING.md`)
- `--minCommits`: The minimum number of commits required to appear in the ranking (default: `10`)

**Example:**
```bash
bunx github:FlokiTV/git-commit-status --branch=develop --fileName=MY_RANKING.md --minCommits=5
```

This project was created using `bun init` in bun v1.3.0. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.