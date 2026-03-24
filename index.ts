#!/usr/bin/env bun
import { $ } from "bun";
import { parseArgs } from "util";

// cmd example: bunx github:FlokiTV/git-commit-status --branch=main --fileName=RANKING.md --minCommits=10
const { values } = parseArgs({
  args: Bun.argv,
  options: {
    branch: {
      type: 'string',
      default: 'main',
    },
    fileName: {
      type: 'string',
      default: 'RANKING.md',
    },
    minCommits: {
      type: 'string',
      default: '10',
    },
  },
  strict: true,
  allowPositionals: true,
});

const branch = values.branch;
const fileName = values.fileName;
const minCommits = Number(values.minCommits);
const logOutput = await $`git log ${branch} --pretty=format:"COMMIT|%an|%ad" --numstat --date=short`.text();

const commits: { author: string; date: string; lines: number }[] = [];
let currentCommit: { author: string; date: string; lines: number } | null = null;

for (const line of logOutput.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed) continue;

  if (trimmed.startsWith("COMMIT|")) {
    const [, author, date] = trimmed.split("|");
    if (author && date) {
      currentCommit = { author: author.trim(), date: date.trim(), lines: 0 };
      commits.push(currentCommit);
    } else {
      currentCommit = null;
    }
  } else if (currentCommit) {
    const [added, deleted] = trimmed.split(/\s+/);
    const addedNum = Number(added);
    const deletedNum = Number(deleted);
    if (!Number.isNaN(addedNum)) currentCommit.lines += addedNum;
    if (!Number.isNaN(deletedNum)) currentCommit.lines += deletedNum;
  }
}

const parseDayId = (date: string): number | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if ([year, month, day].some(Number.isNaN)) {
    return null;
  }

  return Date.UTC(year, month - 1, day) / 86_400_000;
};

interface AuthorStats {
  author: string;
  commits: number;
  lines: number;
  streak: number;
}

const getRanking = (sourceCommits: { author: string; date: string; lines: number }[]): AuthorStats[] => {
  const countByAuthor = new Map<string, number>();
  const linesByAuthor = new Map<string, number>();
  const datesByAuthor = new Map<string, Set<string>>();

  for (const { author, date, lines } of sourceCommits) {
    countByAuthor.set(author, (countByAuthor.get(author) ?? 0) + 1);
    linesByAuthor.set(author, (linesByAuthor.get(author) ?? 0) + lines);
    if (!datesByAuthor.has(author)) {
      datesByAuthor.set(author, new Set<string>());
    }
    datesByAuthor.get(author)?.add(date);
  }

  const stats: AuthorStats[] = [];

  for (const [author, dates] of datesByAuthor.entries()) {
    const sortedDays = [...dates]
      .map((date) => parseDayId(date))
      .filter((day): day is number => day !== null)
      .sort((a, b) => a - b);

    let currentStreak = 0;
    let maxStreak = 0;
    let previousDay = -1;

    for (const day of sortedDays) {
      if (day === previousDay + 1) {
        currentStreak += 1;
      } else {
        currentStreak = 1;
      }
      if (currentStreak > maxStreak) {
        maxStreak = currentStreak;
      }
      previousDay = day;
    }

    stats.push({
      author,
      commits: countByAuthor.get(author) ?? 0,
      lines: linesByAuthor.get(author) ?? 0,
      streak: maxStreak,
    });
  }

  return stats.sort((a, b) => 
    b.lines - a.lines || 
    b.commits - a.commits || 
    b.streak - a.streak || 
    a.author.localeCompare(b.author, "pt-BR")
  );
};

const minimumCommits = minCommits;
const ranking = getRanking(commits);
const filteredRanking = ranking.filter((stat) => stat.commits > minimumCommits);

const commitsWithDay = commits
  .map((commit) => {
    const dayId = parseDayId(commit.date);
    if (dayId === null) {
      return null;
    }
    return { ...commit, dayId };
  })
  .filter((commit): commit is { author: string; date: string; lines: number; dayId: number } => commit !== null);

const now = new Date();
const todayDayId =
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86_400_000;
const weekDay = new Date(todayDayId * 86_400_000).getUTCDay();
const weekStartDayId = todayDayId - ((weekDay + 6) % 7);
const weekEndDayId = weekStartDayId + 6;

const monthStartDayId = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 86_400_000;
const nextMonthStartDayId = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) / 86_400_000;
const monthEndDayId = nextMonthStartDayId - 1;
const daysInMonth = monthEndDayId - monthStartDayId + 1;

const weeklyCommits = commitsWithDay.filter(
  (commit) => commit.dayId >= weekStartDayId && commit.dayId <= weekEndDayId,
);
const monthlyCommits = commitsWithDay.filter(
  (commit) => commit.dayId >= monthStartDayId && commit.dayId <= monthEndDayId
);
const weeklyRanking = getRanking(weeklyCommits).filter((stat) => stat.commits > minimumCommits);
const monthlyRanking = getRanking(monthlyCommits).filter((stat) => stat.commits > minimumCommits);
const weeklyDays = Array.from({ length: 7 }, (_, index) => weekStartDayId + index);
const monthlyDays = Array.from({ length: daysInMonth }, (_, index) => monthStartDayId + index);

const formatDayId = (dayId: number): string =>
  new Date(dayId * 86_400_000).toLocaleDateString("pt-BR", { timeZone: "UTC" });

const weeklyCommitsByAuthorDays = new Map<string, Set<number>>();
for (const { author, dayId } of weeklyCommits) {
  if (!weeklyCommitsByAuthorDays.has(author)) {
    weeklyCommitsByAuthorDays.set(author, new Set<number>());
  }
  weeklyCommitsByAuthorDays.get(author)?.add(dayId);
}

const monthlyCommitsByAuthorDays = new Map<string, Set<number>>();
for (const { author, dayId } of monthlyCommits) {
  if (!monthlyCommitsByAuthorDays.has(author)) {
    monthlyCommitsByAuthorDays.set(author, new Set<number>());
  }
  monthlyCommitsByAuthorDays.get(author)?.add(dayId);
}

const totalCommits = filteredRanking.reduce((acc, stat) => acc + stat.commits, 0);
const medal = ["🥇", "🥈", "🥉"];
const today = new Date().toLocaleDateString("pt-BR");

const rankingRows = filteredRanking
  .map((stat, index) => {
    const position = index + 1;
    const badge = medal[index] ?? "🏅";
    const score = stat.commits * 100;
    return `| ${position} | ${badge} ${stat.author} | ${stat.lines} | ${stat.commits} | ${score} XP | 💻 ${stat.streak} dias |`;
  })
  .join("\n");

const createPeriodRows = (periodRanking: AuthorStats[]): string =>
  periodRanking
    .map((stat, index) => {
      const position = index + 1;
      const badge = medal[index] ?? "🏅";
      const score = stat.commits * 100;
      return `| ${position} | ${badge} ${stat.author} | ${stat.lines} | ${stat.commits} | ${score} XP |`;
    })
    .join("\n");

const weeklyRows = createPeriodRows(weeklyRanking);
const monthlyRows = createPeriodRows(monthlyRanking);
const weeklyHeatmapRows = weeklyRanking
  .map(({ author }) => {
    const authorDays = weeklyCommitsByAuthorDays.get(author) ?? new Set<number>();
    const cells = weeklyDays.map((dayId) => (authorDays.has(dayId) ? "🟩" : "⬜")).join(" | ");
    return `| ${author} | ${cells} |`;
  })
  .join("\n");
const monthlyHeatmapRows = monthlyRanking
  .map(({ author }) => {
    const authorDays = monthlyCommitsByAuthorDays.get(author) ?? new Set<number>();
    const cells = monthlyDays.map((dayId) => (authorDays.has(dayId) ? "🟩" : "⬜")).join("");
    return `| ${author} | ${cells} |`;
  })
  .join("\n");
const weeklyPeriod = `${formatDayId(weekStartDayId)} a ${formatDayId(weekEndDayId)}`;
const monthlyPeriod = `${formatDayId(monthStartDayId)} a ${formatDayId(monthEndDayId)}`;

const markdown = [
  "# 🏆 Ranking de Commits",
  "",
  `**Branch:** \`${branch}\``,
  `**Data:** ${today}`,
  `**Total de commits:** ${totalCommits}`,
  "",
  "## 🧠 Ranking Geral",
  filteredRanking.length
    ? "| Posição | Jogador | Linhas | Commits | Pontuação | Code Streak Máx. |\n| --- | --- | ---: | ---: | ---: | ---: |\n" +
      rankingRows
    : "Nenhum autor com mais de 5 commits para montar o ranking geral.",
  "",
  "## 📅 Ranking Semanal (Segunda a Domingo)",
  `**Período:** ${weeklyPeriod}`,
  weeklyRanking.length
    ? "| Posição | Jogador | Linhas | Commits | Pontuação |\n| --- | --- | ---: | ---: | ---: |\n" + weeklyRows
    : "Nenhum autor com mais de 5 commits no ranking semanal.",
  "",
  "### 🗂️ Heatmap Semanal",
  weeklyRanking.length
    ? "| Autor | Seg | Ter | Qua | Qui | Sex | Sáb | Dom |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n" +
      weeklyHeatmapRows
    : "Sem dados para heatmap semanal.",
  "",
  `## 🗓️ Ranking Mensal (${daysInMonth} dias)`,
  `**Período:** ${monthlyPeriod}`,
  monthlyRanking.length
    ? "| Posição | Jogador | Linhas | Commits | Pontuação |\n| --- | --- | ---: | ---: | ---: |\n" + monthlyRows
    : "Nenhum autor com mais de 5 commits no ranking mensal.",
  "",
  "### 🗂️ Heatmap Mensal",
  monthlyRanking.length
    ? `| Autor | Heatmap (${daysInMonth} dias) |\n| --- | --- |\n` + monthlyHeatmapRows
    : "Sem dados para heatmap mensal.",
  "",
  "## 🎮 Regras de Pontuação",
  "- Cada commit vale **100 XP**.",
  "- A posição no ranking é definida por: **Linhas alteradas > Commits > Code Streak**.",
  `- Todos os rankings só exibem quem tiver **mais de ${minimumCommits} commits**.`,
  "- Code Streak conta dias seguidos com commit; se ficar 1 dia sem, zera.",
  "- Em caso de empate, o nome do autor define a ordem.",
].join("\n");

await Bun.write(fileName, `${markdown}\n`);
