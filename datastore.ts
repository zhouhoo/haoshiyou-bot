import {Message, Contact} from "wechaty";
import {FriendRequest} from "wechaty/dist/src/friend-request";
import {HsyListing} from "./loopbacksdk/models/HsyListing";
import {LoopbackQuerier} from "./loopback-querier";
import { Logger, LoggerConfig } from "log4ts";
import ConsoleAppender from "log4ts/build/appenders/ConsoleAppender";
import BasicLayout from "log4ts/build/layouts/BasicLayout";
import {LogLevel} from "log4ts/build/LogLevel";

let appender = new ConsoleAppender();
let layout = new BasicLayout();
appender.setLayout(layout);
let config = new LoggerConfig(appender);
config.setLevel(LogLevel.ALL);
Logger.setConfig(config);

const file = 'log.json';
const fileListings = 'potential-posting.json';
const jsonfile = require('jsonfile');
const util = require('util');
class HsyBotLogObject {
  public type: HsyBotLoggerType;
  public contact:Contact;
  public groupEnum:HsyGroupEnum;
  public rawChatMessage:Message; // for logging the original messsage
  public friendRequestMessage:string;
  public debugMessage:string;
  public timestamp:Date;
  constructor() {
    this.timestamp = new Date();
  }
}

/**
 * Please never reuse enum ids, since things here goes into logs.
 *
 * NextId = 7;
 */
export enum HsyGroupEnum {
  TestGroup = 0,
  SouthBayEast = 1,
  SouthBayWest = 2,
  EastBay = 3,
  SanFrancisco = 4,
  MidPeninsula = 5,
  ShortTerm = 6,
  OldFriends = 7,
  Seattle = 8,
  None = -1,
}

/**
 * Please never reuse enum ids, since things here goes into logs.
 *
 * NextId = 5;
 */
export enum HsyBotLoggerType {
  debugInfo = 1,
  chatEvent = 2,
  friendRequestEvent = 3,
  botAddToGroupEvent = 4
}

export class HsyBotLogger {
  private static lq:LoopbackQuerier = new LoopbackQuerier();
  public static logger = Logger.getLogger(`HsyBotLogger`);
  public static async logBotAddToGroupEvent(
      contact:Contact,
      groupEnum:HsyGroupEnum):Promise<void> {
    let logItem = new HsyBotLogObject();
    logItem.type = HsyBotLoggerType.botAddToGroupEvent;
    logItem.groupEnum = groupEnum;
    logItem.contact = contact;
    await HsyBotLogger.log(logItem);
  }
  public static async logFriendRequest(requestMessage:FriendRequest):Promise<void> {
    let logItem = new HsyBotLogObject();
    logItem.type = HsyBotLoggerType.friendRequestEvent;
    logItem.contact = requestMessage.contact;
    logItem.friendRequestMessage = requestMessage.hello;
    await HsyBotLogger.log(logItem);
  }

  public static async logRawChatMsg(message: Message):Promise<void> {
    let logItem = new HsyBotLogObject();
    logItem.type = HsyBotLoggerType.chatEvent;
    logItem.rawChatMessage = message;
    await HsyBotLogger.log(logItem);
  }

  private static async log(logItem:HsyBotLogObject):Promise<void> {
    let inspectedLogItem = util.inspect(logItem);
    let msg = `XXX DEBUG LOG ${JSON.stringify(inspectedLogItem)}`;
    this.logger.debug(msg);
    await jsonfile.writeFileSync(file, inspectedLogItem, {flag: 'a'});
  }

  public static async logDebug(str:string):Promise<void> {
    let logItem = new HsyBotLogObject();
    logItem.type = HsyBotLoggerType.debugInfo;
    logItem.debugMessage = str;
    await this.log(logItem);
  }

  public static async logListing(m:Message, hsyGroupEnum:HsyGroupEnum) {
    let c:Contact = m.from();
    let listing = {
      contact: c.name(),
      groupNickName: c['rawObj']['DisplayName'],
      content: m.content()
    };

    let hsyListing:HsyListing = new HsyListing();
    hsyListing.ownerId = 'haoshiyou-admin';
    hsyListing.lastUpdated = new Date();
    hsyListing.uid = 'group-collected-' + c.name();
    hsyListing.content = m.content();
    hsyListing.title = m.content().slice(0, 25);
    hsyListing.hsyGroupEnum = HsyGroupEnum[hsyGroupEnum];
    hsyListing.wechatId = m.from().weixin();
    await HsyBotLogger.lq.setHsyListing(hsyListing);
    HsyBotLogger.logger.debug(`Successfully stored ${JSON.stringify(hsyListing)}`);
    await jsonfile.writeFileSync(fileListings, listing, {flag: 'a'});
  }

  public static async logListingImage(m:Message, hsyGroupEnum:HsyGroupEnum, imagePublicId:string) {
    let c:Contact = m.from();
    let uid = 'group-collected-' + c.name();
    let hsyListing:HsyListing = await HsyBotLogger.lq.getHsyListingByUid(uid);
    if (hsyListing === undefined || hsyListing === null) {
      // create new listing
      hsyListing = new HsyListing();
      hsyListing.ownerId = 'haoshiyou-admin';
      hsyListing.uid = 'group-collected-' + c.name();
      hsyListing.title = m.content().slice(0, 25);
      hsyListing.hsyGroupEnum = HsyGroupEnum[hsyGroupEnum];
      hsyListing.wechatId = m.from().weixin();
      hsyListing.imageIds = [imagePublicId];
    } else {
      hsyListing.imageIds = hsyListing.imageIds.concat(imagePublicId);
    }
    hsyListing.lastUpdated = new Date();

    HsyBotLogger.logger.debug(`Updating image ${imagePublicId} for contact ${uid}`);
    let updatedHsyListing = await HsyBotLogger.lq.setHsyListing(hsyListing);

    HsyBotLogger.logger.debug(`Done updating image ${imagePublicId} for contact ${uid}`);
    HsyBotLogger.logger.debug(`updatedHsyListing =   ${JSON.stringify(updatedHsyListing)}`);
    return updatedHsyListing;
  }
}