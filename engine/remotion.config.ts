import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
// GPU-рендер в headless Chrome на macOS (быстрее блюр и фильтры)
Config.setChromiumOpenGlRenderer('angle');
Config.setOverwriteOutput(true);
