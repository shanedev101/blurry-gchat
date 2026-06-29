/**
 * Side panel entry point.
 *
 * Composes the panel from its feature modules. The script tag is at the end of
 * <body>, so the DOM is ready by the time this module runs.
 */

import { initLayout } from './panel/layout';
import { initPower } from './panel/power';
import { initPrivacy } from './panel/privacy';
import { initUnflow } from './panel/unflow';
import { initBackup } from './panel/backup';
import { initHelp } from './panel/help';

initPower();
void initLayout();
initPrivacy();
void initUnflow();
initBackup();
initHelp();
