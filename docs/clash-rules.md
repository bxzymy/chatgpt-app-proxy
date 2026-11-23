# Clash/Mihomo rules: example and verification

**Rules are not a traffic capture mechanism.** They take effect only after an app sends traffic to the local proxy. Keep Rule mode enabled, with System Proxy and TUN disabled, and use the launcher to attempt per-app proxying.

Add rules in an appropriate profile override/mixin **before more general rules** (the exact UI depends on your Clash Verge version):

```yaml
rules:
  - DOMAIN-SUFFIX,chatgpt.com,PROXY
  - DOMAIN-SUFFIX,openai.com,PROXY
  - DOMAIN-SUFFIX,oaistatic.com,PROXY
  - DOMAIN-SUFFIX,oaiusercontent.com,PROXY
  - DOMAIN-SUFFIX,oaistatsig.com,PROXY
  # ... preserve your other rules here ...
```

**Do not replace your whole existing `rules:` list with this snippet.** `PROXY` is an **example proxy group**; replace it with the exact name of your existing proxy group. Domain requirements may vary with the app and change over time. Consult OpenAI's network recommendations:

https://help.openai.com/en/articles/9247338-network-recommendations-for-chatgpt-errors-on-web-and-apps

## Verify

1. Check your HTTP/Mixed port (`7890` by default).
2. Completely quit the existing ChatGPT process and run the launcher.
3. Look at Clash Verge > Connections. Verify request destination, matched rule and outbound.
4. Test sign-in, sending a prompt and streaming a reply.

A local TCP listener check only proves the port is open; it does **not** prove a working proxy node or that the app is using the proxy.
