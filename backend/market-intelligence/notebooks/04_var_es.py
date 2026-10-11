# %% [markdown]
# # Module 2 — Value at Risk (3 méthodes) & Expected Shortfall (XAU/USD)
#
# Objectif : calculer la VaR à 1 jour selon les 3 méthodes classiques
# (historique, paramétrique, Monte Carlo), ainsi que l'Expected Shortfall
# associé, et comparer les résultats. On réutilise directement les
# rendements réels (`01_preprocessing`), les paramètres calibrés
# (`02_calibration_gbm`) et les trajectoires simulées (`03_monte_carlo`).
#
# Rappel des définitions :
# - **VaR_α** : la perte maximale qu'on ne devrait *pas* dépasser avec une
#   probabilité α (ex: VaR 99% = la perte qu'on ne dépasse que 1% du
#   temps, "dans le pire des cas 1 jour sur 100").
# - **Expected Shortfall (ES_α)**, aussi appelé CVaR : la perte *moyenne*
#   sachant qu'on a déjà dépassé la VaR — répond à la question que la VaR
#   seule laisse ouverte : "et si on dépasse la VaR, c'est grave à quel
#   point en moyenne ?"

# %%
import json
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from scipy import stats

pd.set_option("display.width", 120)
plt.rcParams["figure.figsize"] = (11, 4.5)

df = pd.read_csv("../data/processed/xau_1d_processed.csv", index_col=0, parse_dates=True)
hist_returns = df["log_return"].dropna().to_numpy()

mc_returns = np.load("../data/processed/mc_returns_1d_100k.npy")

with open("../data/processed/gbm_params.json") as f:
    gbm = json.load(f)
daily_mean = gbm["full_history"]["daily_mean"]
daily_std = gbm["full_history"]["daily_std"]

S0 = df["Close"].iloc[-1]
print(f"Rendements historiques : {len(hist_returns)} | Rendements simulés MC : {len(mc_returns)}")
print(f"Paramètres paramétriques : moyenne journalière = {daily_mean:.6f}, écart-type journalier = {daily_std:.6f}")
print(f"Prix de référence S0 = {S0:.2f}")

# %% [markdown]
# ## 1. Les 3 méthodes, implémentées
#
# - **Historique** : on prend directement le percentile empirique des
#   rendements réellement observés — aucune hypothèse de distribution.
# - **Paramétrique (variance-covariance)** : on suppose que les rendements
#   suivent une loi normale `N(moyenne, écart-type)`, et on utilise la
#   formule fermée `VaR_α = -(moyenne + z_α·écart-type)`.
# - **Monte Carlo** : on prend le percentile empirique des rendements
#   *simulés* dans le notebook 3 — conceptuellement proche de la méthode
#   historique, mais appliquée à des données générées par le modèle plutôt
#   qu'observées.

# %%
def var_es_historical(returns: np.ndarray, alpha: float) -> dict:
    var = -np.percentile(returns, alpha * 100)
    tail = returns[returns <= -var]
    es = -tail.mean()
    return {"VaR": var, "ES": es, "n_queue": len(tail)}


def var_es_parametric(mean: float, std: float, alpha: float) -> dict:
    z = stats.norm.ppf(alpha)
    var = -(mean + z * std)
    es = -(mean - std * stats.norm.pdf(z) / alpha)
    return {"VaR": var, "ES": es, "n_queue": None}


def var_es_montecarlo(sim_returns: np.ndarray, alpha: float) -> dict:
    var = -np.percentile(sim_returns, alpha * 100)
    tail = sim_returns[sim_returns <= -var]
    es = -tail.mean()
    return {"VaR": var, "ES": es, "n_queue": len(tail)}


print("3 fonctions définies.")

# %% [markdown]
# ## 2. Calcul à 95% et 99% de confiance
#
# 99% est le niveau standard Basel pour le risque de marché ; 95% est
# souvent reporté en complément (plus réactif, moins extrême).

# %%
rows = []
for alpha, conf_label in [(0.05, "95%"), (0.01, "99%")]:
    h = var_es_historical(hist_returns, alpha)
    p = var_es_parametric(daily_mean, daily_std, alpha)
    m = var_es_montecarlo(mc_returns, alpha)
    for method_label, res in [("Historique", h), ("Paramétrique", p), ("Monte Carlo", m)]:
        rows.append({"confiance": conf_label, "méthode": method_label, "VaR": res["VaR"], "ES": res["ES"], "n_queue": res["n_queue"]})

results = pd.DataFrame(rows)
results_display = results.copy()
results_display["VaR"] = results_display["VaR"].map(lambda x: f"{x:.4%}")
results_display["ES"] = results_display["ES"].map(lambda x: f"{x:.4%}")
results_display

# %% [markdown]
# **Interprétation** — à 95%, les 3 méthodes sont proches (VaR entre 1,71%
# et 1,77%) : à ce niveau de confiance, l'hypothèse de normalité n'est pas
# encore trop mise en défaut, l'essentiel de l'écart avec la réalité se
# concentre plus loin dans la queue de distribution.
#
# **À 99%, l'écart devient net et c'est le résultat le plus important de ce
# notebook** : la VaR historique (3,14%) dépasse la VaR paramétrique
# (2,50%) et la VaR Monte Carlo (2,51%) d'environ **+26%**. C'est
# exactement la conséquence chiffrée, au niveau du calcul de VaR cette
# fois (pas juste au niveau de la forme de la distribution comme dans les
# notebooks précédents), de la kurtosis élevée et des outliers identifiés
# dès le notebook 1 : les méthodes qui supposent la normalité (paramétrique
# et, ici, Monte Carlo puisqu'il est basé sur un GBM à rendements normaux)
# **sous-estiment le risque réel de l'or d'environ un quart, précisément au
# niveau de confiance que Basel utilise pour le calcul des exigences de
# fonds propres**. C'est un résultat concret et défendable pour le rapport,
# pas une remarque théorique.
#
# Sur l'Expected Shortfall : pour chaque méthode, ES > VaR (logique, l'ES
# est une moyenne sur une queue de distribution qui commence là où la VaR
# s'arrête). L'écart entre ES et VaR est lui-même informatif : pour la
# méthode historique à 99%, l'ES (4,31%) dépasse la VaR (3,14%) de +37% —
# ça répond à la question "si jamais on dépasse la VaR, à quel point c'est
# grave en moyenne ?", une question que la VaR seule, en tant que simple
# quantile, ne permet pas de répondre. C'est précisément pourquoi les
# standards réglementaires les plus récents (FRTB, le cadre Basel pour le
# risque de marché) poussent vers l'ES plutôt que la seule VaR comme mesure
# de référence.

# %% [markdown]
# ## 3. Traduction concrète en perte monétaire
#
# Les pourcentages ci-dessus sont abstraits — on les traduit en perte
# potentielle sur deux exemples concrets : une position notionnelle de 1
#000 000 USD, et une position physique de 100 onces d'or au prix actuel.

# %%
notional_usd = 1_000_000
oz_position = 100

money = results.copy()
money["VaR_USD_notional"] = money["VaR"] * notional_usd
money["ES_USD_notional"] = money["ES"] * notional_usd
money["VaR_USD_100oz"] = money["VaR"] * S0 * oz_position
money["ES_USD_100oz"] = money["ES"] * S0 * oz_position

money[["confiance", "méthode", "VaR_USD_notional", "ES_USD_notional", "VaR_USD_100oz", "ES_USD_100oz"]].style.format({
    "VaR_USD_notional": "{:,.0f}", "ES_USD_notional": "{:,.0f}",
    "VaR_USD_100oz": "{:,.0f}", "ES_USD_100oz": "{:,.0f}",
})

# %% [markdown]
# **Interprétation, en langage de gestion des risques** — pour une
# position notionnelle de 1 000 000 USD sur l'or, la lecture opérationnelle
# de la VaR historique à 99% est : *"un jour sur 100 (en moyenne), on peut
# s'attendre à perdre plus de 31 422 USD sur cette position — et les jours
# où ça arrive, la perte moyenne réelle est de 43 067 USD"*. C'est ce genre
# de phrase, chiffrée et actionnable, qu'un rapport de risque de marché
# doit pouvoir produire — et c'est directement ce que le module doit
# fournir au client/à l'utilisateur de la plateforme.
#
# Pour une position physique de 100 onces (~489 000 USD au prix actuel),
# la VaR historique à 99% représente une perte potentielle d'environ
# 15 364 USD sur une seule journée.

# %% [markdown]
# ## 4. Une mise en garde méthodologique importante
#
# Un piège classique à ce stade : regarder le nombre de jours historiques
# qui dépassent effectivement la VaR calculée (`n_queue`) et conclure que
# "ça valide le modèle". **Ce n'est pas une validation.**

# %%
print(f"VaR historique 99% : {results.loc[(results['confiance']=='99%') & (results['méthode']=='Historique'), 'n_queue'].values[0]:.0f} dépassements sur {len(hist_returns)} jours ({results.loc[(results['confiance']=='99%') & (results['méthode']=='Historique'), 'n_queue'].values[0] / len(hist_returns):.3%})")

# %% [markdown]
# **Interprétation** — on trouve 56 dépassements sur 5526 jours, soit
# 1,01% — quasiment exactement le 1% attendu pour une VaR à 99%. Ça peut
# donner l'impression trompeuse que "le modèle est validé". En réalité,
# **c'est presque tautologique** : la VaR historique à 99% est *définie*
# comme le percentile 1% de cette même série de données — il est donc
# presque garanti par construction que ~1% des observations la dépassent,
# puisqu'on a utilisé ces mêmes observations pour fixer le seuil. C'est un
# test en échantillon (in-sample), qui ne prouve rien sur la capacité du
# modèle à bien fonctionner sur des données futures qu'il n'a pas vues.
#
# La vraie question qu'un backtesting doit répondre est différente : *"si
# on avait calibré la VaR sur une fenêtre glissante de données passées, et
# qu'on l'avait appliquée aux jours suivants (qu'elle n'a jamais vus),
# est-ce que le taux de dépassement observé reste proche du taux attendu
# ?"* — une évaluation hors échantillon (out-of-sample), glissante dans le
# temps. C'est exactement l'objet du test de Kupiec, dans le notebook
# suivant : il ne se contente pas de compter les dépassements, il applique
# un test statistique formel (ratio de vraisemblance) sur un backtesting
# glissant, et classe le résultat selon les zones Bâloises (verte/jaune/
# rouge) selon le nombre de dépassements sur une fenêtre de 250 jours.

# %% [markdown]
# ## 5. Sauvegarde

# %%
results.to_csv("../data/processed/var_es_results.csv", index=False)
print("Sauvegardé : data/processed/var_es_results.csv")
results

# %% [markdown]
# ## 6. Résumé & prochaine étape
#
# - VaR et ES calculés à 95% et 99%, pour les 3 méthodes (historique,
#   paramétrique, Monte Carlo).
# - Résultat clé : à 99%, la VaR historique dépasse la VaR paramétrique/MC
#   d'environ +26% — conséquence chiffrée, au niveau du calcul de risque,
#   des queues épaisses déjà identifiées dans les notebooks précédents.
# - ES toujours > VaR (logique), et l'écart ES/VaR quantifie la sévérité
#   moyenne au-delà du seuil — justifie l'intérêt de l'ES en complément de
#   la VaR (cohérent avec l'évolution réglementaire FRTB).
# - Mise en garde méthodologique posée : le comptage de dépassements
#   in-sample n'est pas un backtesting valide — nécessite une évaluation
#   hors échantillon.
#
# **Prochaine étape** : backtesting de Kupiec, en conditions hors
# échantillon (fenêtre glissante), avec classement selon les zones Bâloises
# (verte / jaune / rouge), pour déterminer laquelle des 3 méthodes tient
# réellement ses promesses sur données jamais vues par la calibration.
