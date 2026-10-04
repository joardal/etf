"""Small correctness checks for the historical portfolio calculation."""
import json
import unittest
from pathlib import Path

import pandas as pd

from build_model_portfolios import period_result, simulate


class PortfolioHistoryTests(unittest.TestCase):
    def test_rebalances_before_the_first_return_of_a_new_quarter(self):
        prices = pd.DataFrame(
            {"A": [100, 120, 120, 132], "B": [100, 100, 110, 110]},
            index=pd.to_datetime(["2024-03-29", "2024-04-01", "2024-04-02", "2024-07-01"]),
        )
        nav = simulate(prices, {"A": 0.5, "B": 0.5})
        self.assertEqual([round(value, 2) for value in nav], [100, 110, 115, 120.75])

    def test_period_return_uses_one_common_start_date(self):
        dates = pd.to_datetime(["2024-01-02", "2024-01-03", "2024-01-04"])
        portfolio = pd.Series([100, 110, 121], index=dates)
        benchmark = pd.Series([100, 105, 110], index=dates)
        result = period_result(portfolio, benchmark, pd.Timestamp("2024-01-03"))
        self.assertEqual(result["from"], "2024-01-03")
        self.assertEqual(result["portfolio"], 10.0)
        self.assertEqual(result["benchmark"], 4.76)
        self.assertEqual(result["excess_pp"], 5.24)

    def test_published_data_has_comparable_dates_and_complete_weights(self):
        payload = json.loads((Path(__file__).parent / "model_portfolios.json").read_text(encoding="utf-8"))
        self.assertEqual(payload["currency"], "EUR")
        self.assertEqual(len(payload["portfolios"]), 3)
        for portfolio in payload["portfolios"]:
            self.assertAlmostEqual(sum(fund["weight"] for fund in portfolio["holdings"]), 100)
            self.assertEqual(portfolio["metrics"]["3y"]["from"], portfolio["chart"][0]["date"])
            self.assertEqual(portfolio["metrics"]["3y"]["to"], portfolio["chart"][-1]["date"])
            for period in ("1m", "3y"):
                metric = portfolio["metrics"][period]
                self.assertAlmostEqual(metric["portfolio"] - metric["benchmark"], metric["excess_pp"], places=2)


if __name__ == "__main__":
    unittest.main()
