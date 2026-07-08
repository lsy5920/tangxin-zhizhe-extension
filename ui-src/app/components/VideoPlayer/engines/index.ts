/**
 * 播放器引擎工厂
 *
 * 统一管理不同的播放器引擎创建和切换
 */

import { ArtplayerEngine } from './ArtplayerEngine';
import { XGPlayerEngine } from './XGPlayerEngine';
import type {
  PlayerEngine,
  PlayerEngineConfig,
  PlayerEngineInstance
} from './types';

export class PlayerEngineFactory {
  /**
   * 创建播放器引擎实例
   * @param engine 播放器引擎类型
   * @param config 播放器配置
   * @returns 播放器引擎实例
   */
  static createEngine(
    engine: PlayerEngine,
    config: PlayerEngineConfig
  ): PlayerEngineInstance {
    switch (engine) {
      case 'artplayer':
        return new ArtplayerEngine(config);
      case 'xgplayer':
        return new XGPlayerEngine(config);
      default:
        throw new Error(`不支持的播放器引擎: ${engine}`);
    }
  }

  /**
   * 获取推荐的播放器引擎
   * 根据URL类型和浏览器环境自动选择最佳引擎
   * @param url 视频URL
   * @returns 推荐的播放器引擎
   */
  static getRecommendedEngine(url: string): PlayerEngine {
    const isHls = /\.m3u8(?:[?#]|$)/i.test(url);
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );

    // HLS 流在移动端推荐使用 XGPlayer，桌面端使用 Artplayer
    if (isHls) {
      return isMobile ? 'xgplayer' : 'artplayer';
    }

    // MP4 等直接视频使用 Artplayer
    return 'artplayer';
  }

  /**
   * 检查播放器引擎是否可用
   * @param engine 播放器引擎类型
   * @returns 是否可用
   */
  static isEngineAvailable(engine: PlayerEngine): boolean {
    try {
      switch (engine) {
        case 'artplayer':
          return typeof ArtplayerEngine !== 'undefined';
        case 'xgplayer':
          return typeof XGPlayerEngine !== 'undefined';
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * 获取所有可用的播放器引擎
   * @returns 可用的播放器引擎列表
   */
  static getAvailableEngines(): PlayerEngine[] {
    const engines: PlayerEngine[] = ['artplayer', 'xgplayer'];
    return engines.filter(engine => this.isEngineAvailable(engine));
  }
}

// 导出所有类型和工厂
export * from './types';
export { ArtplayerEngine } from './ArtplayerEngine';
export { XGPlayerEngine } from './XGPlayerEngine';
