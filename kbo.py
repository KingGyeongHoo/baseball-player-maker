
import asyncio
import csv
import re
from statistics import mean
from playwright.async_api import async_playwright

ROOT = "https://www.yagoonara.com"
FIELDS = {
    "타자": [
        ("타율", "타율", 3),
        ("OPS", "OPS", 3),
        ("홈런", "홈런", 0),
        ("타점", "타점", 0),
        ("도루", "도루", 0),
    ],
    "투수": [
        ("ERA", "평균자책", 2),
        ("WHIP", "WHIP", 2),
        ("승리", "승", 0),
        ("탈삼진", "삼진", 0),
    ],
}


def number(s):
    s = str(s or "").strip().replace(",", "").replace("−", "-")
    s = s.replace("⅓", ".333333").replace("⅔", ".666667")
    try:
        return float(s)
    except ValueError:
        return None


async def rankings(browser, year, kind):
    route = "hitter/avg" if kind == "타자" else "pitcher/era"
    p = await browser.new_page()
    await p.goto(
        f"{ROOT}/rankings/{route}/{year}",
        wait_until="domcontentloaded",
        timeout=45000,
    )
    await p.wait_for_timeout(700)

    async def rows():
        return await p.evaluate(r"""(kind) => {
            const target = kind === "타자" ? "타율" : "평균자책";
            const t = [...document.querySelectorAll("table")].find(t => {
                let h = t.querySelector("thead")?.innerText || "";
                return h.includes("선수") && h.includes(target);
            });
            if (!t) return [];
            return [...t.querySelectorAll('tbody a[href*="/players/"]')]
                .map(a => {
                    let m = a.getAttribute("href").match(/\/players\/(\d+)/);
                    return m ? {id:m[1],name:a.innerText.trim()} : null;
                }).filter(Boolean);
        }""", kind)

    try:
        initial = await rows()
        if not initial:
            raise RuntimeError(f"{year} {kind} 순위표가 비어 있음")

        for _ in range(20):
            btn = p.get_by_role(
                "button", name=re.compile(r"더보기\s*\(\d+/\d+\)")
            )
            if await btn.count() == 0:
                break
            n = len(await rows())
            await btn.first.click()
            await p.wait_for_timeout(750)
            if len(await rows()) <= n:
                raise RuntimeError("더보기 목록 로딩 실패")

        found = {r["id"]: r for r in await rows()}
        print(f"{year} {kind}: {len(found)}명 확인")
        return list(found.values())
    finally:
        await p.close()


async def player_row(browser, sem, year, kind, player):
    async with sem:
        p = await browser.new_page()
        try:
            url = f"{ROOT}/players/{player['id']}/yearly/kbo"
            await p.goto(
                url, wait_until="domcontentloaded", timeout=45000
            )
            result = None
            for _ in range(3):
                result = await p.evaluate("""({year,kind}) => {
                    const ts = [...document.querySelectorAll("table")];
                    for (const t of ts) {
                        const heads = [...t.querySelectorAll("thead th")]
                            .map(x => x.innerText.trim());
                        if (!heads.includes("시즌") ||
                            !heads.includes(kind==="타자"?"타석":"이닝") ||
                            !heads.includes(kind==="타자"?"OPS":"WHIP"))
                            continue;
                        return [...t.querySelectorAll("tbody tr")]
                            .map(tr => {
                                const cs = [...tr.querySelectorAll("td")]
                                    .map(td => td.innerText.trim());
                                return Object.fromEntries(
                                    heads.map((h,i) => [h,cs[i]||""])
                                );
                            })
                            .filter(r => r["시즌"]===String(year));
                    }
                    return null;
                }""", {"year": year, "kind": kind})
                if result:
                    break
                await p.wait_for_timeout(800)

            if not result or len(result) != 1:
                raise RuntimeError(f"{url}: 기록 조회 실패")

            r = result[0]
            key = "타석" if kind == "타자" else "이닝"
            threshold = 446 if kind == "타자" else 144
            value = number(r.get(key))
            if value is None:
                raise RuntimeError(f"{url}: {key} 누락")
            if value < threshold:
                return None

            for title, field, _ in FIELDS[kind]:
                if number(r.get(field)) is None:
                    raise RuntimeError(f"{url}: {title} 누락")
            return dict(구분=kind, 연도=year, 선수=player["name"], **r)
        finally:
            await p.close()


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        try:
            groups = []
            for year in range(2021, 2027):
                for kind in ("타자", "투수"):
                    for p in await rankings(browser, year, kind):
                        groups.append((year, kind, p))

            sem = asyncio.Semaphore(5)
            results = await asyncio.gather(
                *(player_row(browser, sem, y, k, p)
                  for y, k, p in groups),
                return_exceptions=True,
            )
            errors = [x for x in results if isinstance(x, Exception)]
            if errors:
                raise RuntimeError(
                    f"수집 실패 {len(errors)}건: {errors[0]}"
                )

            players = [x for x in results if x]
            report = []

            for kind, fields in FIELDS.items():
                ss = [x for x in players if x["구분"] == kind]
                if not ss:
                    raise RuntimeError(f"{kind} 적격 선수 없음")

                for title, key, precision in fields:
                    vs = [(x, number(x[key])) for x in ss]
                    hi = max(v for _, v in vs)
                    lo = min(v for _, v in vs)

                    def label(target):
                        return ", ".join(
                            f"{r['선수']}({r['연도']})"
                            for r, v in vs if v == target
                        )

                    report.append({
                        "구분": kind,
                        "항목": title,
                        "최고치": round(hi, precision),
                        "최고 선수/연도": label(hi),
                        "산술평균": round(
                            mean(v for _, v in vs),
                            3 if precision == 3 else 2
                        ),
                        "최저치": round(lo, precision),
                        "최저 선수/연도": label(lo),
                        "표본": len(vs),
                    })

            for filename, data in [
                ("kbo_2021_2026_summary.csv", report),
                ("kbo_2021_2026_players.csv", players),
            ]:
                keys = list(dict.fromkeys(
                    k for row in data for k in row
                ))
                with open(
                    filename, "w",
                    encoding="utf-8-sig", newline=""
                ) as f:
                    w = csv.DictWriter(f, fieldnames=keys)
                    w.writeheader()
                    w.writerows(data)
                print("생성:", filename)

            for r in report:
                print(" | ".join(map(str, r.values())))
        finally:
            await browser.close()


asyncio.run(main())
