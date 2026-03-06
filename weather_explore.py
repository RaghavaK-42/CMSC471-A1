import pandas as pd

df = pd.read_csv("weather.csv")

# Original 13 colonies
states = ["CT", "DE", "GA", "MD", "MA", "NH", "NJ", "NY", "NC", "PA", "RI", "SC", "VA"]
df_trimmed = df[df["state"].isin(states)]

print(len(df_trimmed))
df_trimmed.to_csv("weather_trimmed.csv", index=False)