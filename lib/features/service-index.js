import * as service01 from '../../apps/features/01-status-card/service.js';
import * as service02 from '../../apps/features/02-error-report/service.js';
import * as service03 from '../../apps/features/03-log-archive/service.js';
import * as service04 from '../../apps/features/04-transaction/service.js';
import * as service05 from '../../apps/features/05-uptime-monitor/service.js';
import * as service06 from '../../apps/features/06-scheduler-center/service.js';
import * as service07 from '../../apps/features/07-help-management/service.js';
import * as service08 from '../../apps/features/08-config-center/service.js';
import * as service09 from '../../apps/features/09-access-control/service.js';
import * as service10 from '../../apps/features/10-namelist/service.js';
import * as service11 from '../../apps/features/11-group-management/service.js';
import * as service12 from '../../apps/features/12-event-monitor/service.js';
import * as service13 from '../../apps/features/13-auto-enter-group/service.js';
import * as service14 from '../../apps/features/14-add-friends/service.js';
import * as service15 from '../../apps/features/15-word-filter/service.js';
import * as service16 from '../../apps/features/16-anti-ad/service.js';
import * as service17 from '../../apps/features/17-batch-withdrawal/service.js';
import * as service18 from '../../apps/features/18-subscription-center/service.js';
import * as service19 from '../../apps/features/19-rss-subscription/service.js';
import * as service20 from '../../apps/features/20-bili-chat/service.js';
import * as service21 from '../../apps/features/21-scheduled-broadcast/service.js';
import * as service22 from '../../apps/features/22-report/service.js';
import * as service23 from '../../apps/features/23-push/service.js';
import * as service24 from '../../apps/features/24-multi-source-daily/service.js';
import * as service25 from '../../apps/features/25-git-poller/service.js';
import * as service26 from '../../apps/features/26-weather/service.js';
import * as service27 from '../../apps/features/27-translator/service.js';
import * as service28 from '../../apps/features/28-picsearcher/service.js';
import * as service29 from '../../apps/features/29-qrcode/service.js';
import * as service30 from '../../apps/features/30-qrrender/service.js';
import * as service31 from '../../apps/features/31-shorturl/service.js';
import * as service32 from '../../apps/features/32-wiki/service.js';
import * as service33 from '../../apps/features/33-exchange-rate/service.js';
import * as service34 from '../../apps/features/34-todo-nlp/service.js';
import * as service35 from '../../apps/features/35-clock/service.js';
import * as service36 from '../../apps/features/36-parser/service.js';
import * as service37 from '../../apps/features/37-song-picker/service.js';
import * as service38 from '../../apps/features/38-memes/service.js';
import * as service39 from '../../apps/features/39-save-pic/service.js';
import * as service40 from '../../apps/features/40-record/service.js';
import * as service41 from '../../apps/features/41-autoreply/service.js';
import * as service42 from '../../apps/features/42-word-bank/service.js';
import * as service43 from '../../apps/features/43-group-summary/service.js';
import * as service44 from '../../apps/features/44-daily-sign/service.js';
import * as service45 from '../../apps/features/45-quote/service.js';
import * as service46 from '../../apps/features/46-essence-message/service.js';
import * as service47 from '../../apps/features/47-group-heat/service.js';
import * as service48 from '../../apps/features/48-group-historian/service.js';
import * as service49 from '../../apps/features/49-lottery-signup/service.js';
import * as service50 from '../../apps/features/50-daily-task/service.js';

export const featureServices = Object.freeze({
  '01': service01,
  '02': service02,
  '03': service03,
  '04': service04,
  '05': service05,
  '06': service06,
  '07': service07,
  '08': service08,
  '09': service09,
  '10': service10,
  '11': service11,
  '12': service12,
  '13': service13,
  '14': service14,
  '15': service15,
  '16': service16,
  '17': service17,
  '18': service18,
  '19': service19,
  '20': service20,
  '21': service21,
  '22': service22,
  '23': service23,
  '24': service24,
  '25': service25,
  '26': service26,
  '27': service27,
  '28': service28,
  '29': service29,
  '30': service30,
  '31': service31,
  '32': service32,
  '33': service33,
  '34': service34,
  '35': service35,
  '36': service36,
  '37': service37,
  '38': service38,
  '39': service39,
  '40': service40,
  '41': service41,
  '42': service42,
  '43': service43,
  '44': service44,
  '45': service45,
  '46': service46,
  '47': service47,
  '48': service48,
  '49': service49,
  '50': service50,
});

export function serviceFor(id) {
  return featureServices[String(id).padStart(2, '0')];
}

export function validateServiceSet(manifests) {
  const ids = new Set((manifests || []).map((manifest) => String(manifest.id).padStart(2, '0')));
  const missing = [...ids].filter((id) => !featureServices[id]);
  const extra = Object.keys(featureServices).filter((id) => !ids.has(id));
  return { ok: missing.length === 0 && extra.length === 0, missing, extra, count: Object.keys(featureServices).length };
}
