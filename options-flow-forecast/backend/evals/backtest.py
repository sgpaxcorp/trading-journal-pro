import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, brier_score_loss
from sklearn.model_selection import TimeSeriesSplit
from app.services.model import train_baseline


def load_dataset(path: str = "./data/training_samples.csv"):
    try:
        df = pd.read_csv(path)
    except FileNotFoundError:
        # mock dataset (placeholder)
        rng = np.random.default_rng(42)
        df = pd.DataFrame({
            "net_call_premium": rng.normal(0, 1, 200),
            "net_put_premium": rng.normal(0, 1, 200),
            "call_put_ratio": rng.normal(1, 0.2, 200),
            "aggressiveness": rng.normal(0, 0.5, 200),
            "concentration_hhi": rng.uniform(0.05, 0.4, 200),
        })
        df["label"] = rng.integers(0, 3, 200)
    return df


def main():
    df = load_dataset()
    X = df[[
        "net_call_premium",
        "net_put_premium",
        "call_put_ratio",
        "aggressiveness",
        "concentration_hhi",
    ]].to_numpy()
    y = df["label"].to_numpy()

    tscv = TimeSeriesSplit(n_splits=5)
    accs = []
    briers = []

    for train_idx, test_idx in tscv.split(X):
        model = train_baseline(X[train_idx], y[train_idx])
        proba = model.predict_proba(X[test_idx])
        preds = proba.argmax(axis=1)
        accs.append(accuracy_score(y[test_idx], preds))
        # Brier for multi-class: mean of one-vs-all
        brier = 0
        for k in range(proba.shape[1]):
            yk = (y[test_idx] == k).astype(int)
            brier += brier_score_loss(yk, proba[:, k])
        briers.append(brier / proba.shape[1])

    print("accuracy", np.mean(accs))
    print("brier", np.mean(briers))


if __name__ == "__main__":
    main()
