import re
import datetime
import requests

config_path = r"C:\Users\ASUS-PC\AppData\Roaming\xdg.config\.wrangler\config\default.toml"
with open(config_path, "r", encoding="utf-8") as f:
    content = f.read()

refresh_match = re.search(r'refresh_token\s*=\s*"([^"]+)"', content)
if not refresh_match:
    print("Ingen refresh_token funnet!")
    exit(1)

rf = refresh_match.group(1)
print("Prøver å fornye token...")
res = requests.post(
    "https://dash.cloudflare.com/oauth2/token",
    headers={"Content-Type": "application/x-www-form-urlencoded"},
    data={
        "grant_type": "refresh_token",
        "client_id": "54d11594-84e4-413e-a4a8-44527e17bc9f",
        "refresh_token": rf,
    },
)

print("HTTP Status:", res.status_code)
try:
    data = res.json()
    if res.status_code == 200:
        new_access = data.get("access_token")
        new_refresh = data.get("refresh_token")
        expires_in = data.get("expires_in", 3600)
        new_exp = (datetime.datetime.utcnow() + datetime.timedelta(seconds=expires_in)).isoformat() + "Z"
        
        # Oppdater default.toml
        new_content = re.sub(r'oauth_token\s*=\s*"[^"]+"', f'oauth_token = "{new_access}"', content)
        new_content = re.sub(r'expiration_time\s*=\s*"[^"]+"', f'expiration_time = "{new_exp}"', new_content)
        if new_refresh:
            new_content = re.sub(r'refresh_token\s*=\s*"[^"]+"', f'refresh_token = "{new_refresh}"', new_content)
        
        with open(config_path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print("Vellykket fornyelse av Cloudflare OAuth token!")
    else:
        print("Respons feil:", data)
except Exception as e:
    print("Feil:", e, res.text[:200])
