# Third-party notices

YunJin Plugin does not bundle or copy source code, binary assets, fonts, fixtures, or private data from reference repositories. The implementation uses Node.js standard APIs and Yunzai runtime interfaces.

## Reference projects studied

The following public repositories were used only for read-only functional study. YunJin Plugin follows L0 clean-room rules: no upstream source code, assets, fixtures, tests, database schema, credentials, or distinctive wording is bundled.

- 01 `plugin-status`: study only; no redistributed content.
- 02 `plugin-sentry`: study only; no redistributed content.
- 03 `nonebot-plugin-logpile`: study only; no redistributed content.
- 04 `nonebot-plugin-sentry-transaction`: study only; no redistributed content.
- 05 `nonebot-plugin-uptimekuma`: study only; no redistributed content.
- 06 `plugin-apscheduler`: study only; no redistributed content.
- 07 `nonebot-plugin-pmhelp`: study only; no redistributed content.
- 08 `nonebot_plugin_uniconf`: study only; no redistributed content.
- 09 `nonebot-plugin-access-control`: study only; no redistributed content.
- 10 `nonebot-plugin-namelist`: study only; no redistributed content.
- 11 `nonebot_plugin_groupmanager`: study only; no redistributed content.
- 12 `nonebot_plugin_eventmonitor`: study only; no redistributed content.
- 13 `nonebot-plugin-auto-enter-group`: study only; no redistributed content.
- 14 `nonebot-plugin-add-friends`: study only; no redistributed content.
- 15 `nonebot-plugin-paminet-nodirtymsg`: study only; no redistributed content.
- 16 `nonebot-plugin-noadpls`: study only; no redistributed content.
- 17 `nonebot-plugin-batch-withdrawal`: study only; no redistributed content.
- 18 `nonebot-bison`: study only; no redistributed content.
- 19 `ELF_RSS`: study only; no redistributed content.
- 20 `nonebot-plugin-bilichat`: study only; no redistributed content.
- 21 `nonebot-plugin-scheduled-broadcast`: study only; no redistributed content.
- 22 `nonebot-plugin-report`: study only; no redistributed content.
- 23 `nonebot-plugin-push`: study only; no redistributed content.
- 24 `nonebot-plugin-multi-source-daily`: study only; no redistributed content.
- 25 `nonebot-plugin-git-poller`: study only; no redistributed content.
- 26 `nonebot-plugin-heweather`: study only; no redistributed content.
- 27 `nonebot_plugin_translator`: study only; no redistributed content.
- 28 `nonebot_plugin_picsearcher`: study only; no redistributed content.
- 29 `nonebot-plugin-qrcode`: study only; no redistributed content.
- 30 `nonebot-plugin-QRrender`: study only; no redistributed content.
- 31 `nonebot-plugin-shorturl`: study only; no redistributed content.
- 32 `nb2-wiki`: study only; no redistributed content.
- 33 `nonebot-plugin-exchangerate`: study only; no redistributed content.
- 34 `nonebot-plugin-todo-nlp`: study only; no redistributed content.
- 35 `nonebot-plugin-clock`: study only; no redistributed content.
- 36 `nonebot-plugin-parser`: study only; no redistributed content.
- 37 `nonebot_plugin_songpicker2`: study only; no redistributed content.
- 38 `nonebot-plugin-memes`: study only; no redistributed content.
- 39 `nonebot-plugin-savepic`: study only; no redistributed content.
- 40 `nonebot_plugin_record`: study only; no redistributed content.
- 41 `nonebot-plugin-autoreply`: study only; no redistributed content.
- 42 `nonebot-plugin-word-bank2`: study only; no redistributed content.
- 43 `nonebot_plugin_summary_group`: study only; no redistributed content.
- 44 `nonebot-plugin-dailysign`: study only; no redistributed content.
- 45 `nonebot_plugin_quote`: study only; no redistributed content.
- 46 `nonebot-plugin-essence-message`: study only; no redistributed content.
- 47 `nonebot-plugin-group-heat`: study only; no redistributed content.
- 48 `nonebot-plugin-group-historian`: study only; no redistributed content.
- 49 `nonebot-plugin-lottery-signup`: study only; no redistributed content.
- 50 `nonebot-plugin-daily-task`: study only; no redistributed content.

License files and observable behavior were reviewed where present. Because no upstream material is redistributed, these entries do not create a runtime dependency or grant permission to reuse upstream content.

Optional public services are used only when their command is invoked:

- Open-Meteo for weather queries.
- Wikipedia REST API for encyclopedia summaries.
- Frankfurter for exchange-rate queries.
- QR Server URL format for QR image fallback.
- Public search providers for image and music search links.

External services are optional. Requests use shared timeout, response-size, protocol, private-network and redirect protections. Their own terms and privacy policies apply.
