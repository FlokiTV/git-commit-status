#!/usr/bin/env bun
import { $ } from "bun";

const branch = process.argv[2] ?? "main";
const fileName = process.argv[3] ?? "RANKING.md";
const logOutput = await $`git log ${branch} --pretty=format:%an%x09%ad --date=short`.text();
const commits = logOutput
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const [author, date] = line.split("\t");
    return { author: author?.trim(), date: date?.trim() };
  })
  .filter((commit) => Boolean(commit.author) && Boolean(commit.date)) as {
  author: string;
  date: string;
}[];

const commitCountByAuthor = new Map<string, number>();
const commitDatesByAuthor = new Map<string, Set<string>>();

for (const { author, date } of commits) {
  commitCountByAuthor.set(author, (commitCountByAuthor.get(author) ?? 0) + 1);
  if (!commitDatesByAuthor.has(author)) {
    commitDatesByAuthor.set(author, new Set<string>());
  }
  commitDatesByAuthor.get(author)?.add(date);
}

const ranking = [...commitCountByAuthor.entries()].sort(
  (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"),
);
const minimumCommits = 5;
const filteredRanking = ranking.filter(([, count]) => count > minimumCommits);
const maxCodeStreakByAuthor = new Map<string, number>();

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

const commitsWithDay = commits
  .map((commit) => {
    const dayId = parseDayId(commit.date);
    if (dayId === null) {
      return null;
    }
    return { ...commit, dayId };
  })
  .filter((commit): commit is { author: string; date: string; dayId: number } => commit !== null);

for (const [author, dates] of commitDatesByAuthor.entries()) {
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

  maxCodeStreakByAuthor.set(author, maxStreak);
}

const countCommitsByAuthor = (source: { author: string }[]): Map<string, number> => {
  const countByAuthor = new Map<string, number>();
  for (const { author } of source) {
    countByAuthor.set(author, (countByAuthor.get(author) ?? 0) + 1);
  }
  return countByAuthor;
};

const sortRanking = (countByAuthor: Map<string, number>): [string, number][] =>
  [...countByAuthor.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));

const now = new Date();
const todayDayId =
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86_400_000;
const weekDay = new Date(todayDayId * 86_400_000).getUTCDay();
const weekStartDayId = todayDayId - ((weekDay + 6) % 7);
const weekEndDayId = weekStartDayId + 6;
const weeklyCommits = commitsWithDay.filter(
  (commit) => commit.dayId >= weekStartDayId && commit.dayId <= weekEndDayId,
);
const monthlyCommits = commitsWithDay.filter((commit) => commit.dayId >= todayDayId - 29);
const weeklyRanking = sortRanking(countCommitsByAuthor(weeklyCommits)).filter(
  ([, count]) => count > minimumCommits,
);
const monthlyRanking = sortRanking(countCommitsByAuthor(monthlyCommits)).filter(
  ([, count]) => count > minimumCommits,
);
const weeklyDays = Array.from({ length: 7 }, (_, index) => weekStartDayId + index);
const monthStartDayId = todayDayId - 29;
const monthlyDays = Array.from({ length: 30 }, (_, index) => monthStartDayId + index);

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

const totalCommits = filteredRanking.reduce((acc, [, count]) => acc + count, 0);
const medal = ["🥇", "🥈", "🥉"];
const today = new Date().toLocaleDateString("pt-BR");

const rankingRows = filteredRanking
  .map(([author, count], index) => {
    const position = index + 1;
    const badge = medal[index] ?? "🏅";
    const score = count * 100;
    const codeStreak = maxCodeStreakByAuthor.get(author) ?? 0;
    return `| ${position} | ${badge} ${author} | ${count} | ${score} XP | 💻 ${codeStreak} dias |`;
  })
  .join("\n");

const createPeriodRows = (periodRanking: [string, number][]): string =>
  periodRanking
    .map(([author, count], index) => {
      const position = index + 1;
      const badge = medal[index] ?? "🏅";
      const score = count * 100;
      return `| ${position} | ${badge} ${author} | ${count} | ${score} XP |`;
    })
    .join("\n");

const weeklyRows = createPeriodRows(weeklyRanking);
const monthlyRows = createPeriodRows(monthlyRanking);
const weeklyHeatmapRows = weeklyRanking
  .map(([author]) => {
    const authorDays = weeklyCommitsByAuthorDays.get(author) ?? new Set<number>();
    const cells = weeklyDays.map((dayId) => (authorDays.has(dayId) ? "🟩" : "⬜")).join(" | ");
    return `| ${author} | ${cells} |`;
  })
  .join("\n");
const monthlyHeatmapRows = monthlyRanking
  .map(([author]) => {
    const authorDays = monthlyCommitsByAuthorDays.get(author) ?? new Set<number>();
    const cells = monthlyDays.map((dayId) => (authorDays.has(dayId) ? "🟩" : "⬜")).join("");
    return `| ${author} | ${cells} |`;
  })
  .join("\n");
const weeklyPeriod = `${formatDayId(weekStartDayId)} a ${formatDayId(weekEndDayId)}`;
const monthlyPeriod = `${formatDayId(monthStartDayId)} a ${formatDayId(todayDayId)}`;

const markdown = [
  "# 🏆 Ranking de Commits",
  "",
  `**Branch:** \`${branch}\``,
  `**Data:** ${today}`,
  `**Total de commits:** ${totalCommits}`,
  "",
  "## 🧠 Ranking Geral",
  filteredRanking.length
    ? "| Posição | Jogador | Commits | Pontuação | Code Streak Máx. |\n| --- | --- | ---: | ---: | ---: |\n" +
      rankingRows
    : "Nenhum autor com mais de 5 commits para montar o ranking geral.",
  "",
  "## 📅 Ranking Semanal (Segunda a Domingo)",
  `**Período:** ${weeklyPeriod}`,
  weeklyRanking.length
    ? "| Posição | Jogador | Commits | Pontuação |\n| --- | --- | ---: | ---: |\n" + weeklyRows
    : "Nenhum autor com mais de 5 commits no ranking semanal.",
  "",
  "### 🗂️ Heatmap Semanal",
  weeklyRanking.length
    ? "| Autor | Seg | Ter | Qua | Qui | Sex | Sáb | Dom |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n" +
      weeklyHeatmapRows
    : "Sem dados para heatmap semanal.",
  "",
  "## 🗓️ Ranking Mensal (30 dias)",
  `**Período:** ${monthlyPeriod}`,
  monthlyRanking.length
    ? "| Posição | Jogador | Commits | Pontuação |\n| --- | --- | ---: | ---: |\n" + monthlyRows
    : "Nenhum autor com mais de 5 commits no ranking mensal.",
  "",
  "### 🗂️ Heatmap Mensal",
  monthlyRanking.length
    ? "| Autor | Heatmap (30 dias) |\n| --- | --- |\n" + monthlyHeatmapRows
    : "Sem dados para heatmap mensal.",
  "",
  "## 🎮 Regras de Pontuação",
  "- Cada commit vale **100 XP**.",
  "- Todos os rankings só exibem quem tiver **mais de 5 commits**.",
  "- Code Streak conta dias seguidos com commit; se ficar 1 dia sem, zera.",
  "- Em caso de empate, o nome do autor define a ordem.",
].join("\n");

await Bun.write(fileName, `${markdown}\n`);
