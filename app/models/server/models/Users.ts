/* eslint-disable @typescript-eslint/camelcase, @typescript-eslint/explicit-function-return-type */
import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import _ from 'underscore';
import s from 'underscore.string';

import { Base } from './_Base';
import Subscriptions from './Subscriptions';
import { settings } from '../../../settings/server/functions/settings';
import { IUsersRepository } from '../../lib';

const queryStatusAgentOnline = (extraFilters = {}) => {
	if (settings.get('Livechat_enabled_when_agent_idle') === false) {
		extraFilters = Object.assign(extraFilters, { statusConnection: { $ne: 'away' } });
	}

	const query = {
		status: {
			$exists: true,
			$ne: 'offline',
		},
		statusLivechat: 'available',
		roles: 'livechat-agent',
		...extraFilters,
	};

	return query;
};

export class Users extends Base implements IUsersRepository {
	constructor(...args) {
		super(...args);

		this.tryEnsureIndex({ roles: 1 }, { sparse: 1 });
		this.tryEnsureIndex({ name: 1 });
		this.tryEnsureIndex({ bio: 1 });
		this.tryEnsureIndex({ createdAt: 1 });
		this.tryEnsureIndex({ lastLogin: 1 });
		this.tryEnsureIndex({ status: 1 });
		this.tryEnsureIndex({ statusText: 1 });
		this.tryEnsureIndex({ active: 1 }, { sparse: 1 });
		this.tryEnsureIndex({ statusConnection: 1 }, { sparse: 1 });
		this.tryEnsureIndex({ appId: 1 }, { sparse: 1 });
		this.tryEnsureIndex({ type: 1 });
		this.tryEnsureIndex({ 'visitorEmails.address': 1 });
		this.tryEnsureIndex({ federation: 1 }, { sparse: true });
		this.tryEnsureIndex({ isRemote: 1 }, { sparse: true });
	}

	getLoginTokensByUserId(userId) {
		const query = {
			'services.resume.loginTokens.type': {
				$exists: true,
				$eq: 'personalAccessToken',
			},
			_id: userId,
		};

		return this.find(query, { fields: { 'services.resume.loginTokens': 1 } });
	}

	addPersonalAccessTokenToUser({ userId, loginTokenObject }) {
		return this.update(userId, {
			$push: {
				'services.resume.loginTokens': loginTokenObject,
			},
		});
	}

	removePersonalAccessTokenOfUser({ userId, loginTokenObject }) {
		return this.update(userId, {
			$pull: {
				'services.resume.loginTokens': loginTokenObject,
			},
		});
	}

	findPersonalAccessTokenByTokenNameAndUserId({ userId, tokenName }) {
		const query = {
			'services.resume.loginTokens': {
				$elemMatch: { name: tokenName, type: 'personalAccessToken' },
			},
			_id: userId,
		};

		return this.findOne(query);
	}

	setOperator(_id, operator) {
		const update = {
			$set: {
				operator,
			},
		};

		return this.update(_id, update);
	}

	findOnlineAgents(agentId) {
		const query = queryStatusAgentOnline(agentId && { _id: agentId });

		return this.find(query);
	}

	findBotAgents(usernameList) {
		const query = {
			roles: {
				$all: ['bot', 'livechat-agent'],
			},
			...usernameList && {
				username: {
					$in: [].concat(usernameList),
				},
			},
		};

		return this.find(query);
	}

	findOneBotAgent() {
		const query = {
			roles: {
				$all: ['bot', 'livechat-agent'],
			},
		};

		return this.findOne(query);
	}

	findOneOnlineAgentByUsername(username, options) {
		const query = queryStatusAgentOnline({ username });

		return this.findOne(query, options);
	}

	findOneOnlineAgentById(_id) {
		const query = queryStatusAgentOnline({ _id });

		return this.findOne(query);
	}

	findOneAgentById(_id, options) {
		const query = {
			_id,
			roles: 'livechat-agent',
		};

		return this.findOne(query, options);
	}

	findAgents() {
		const query = {
			roles: 'livechat-agent',
		};

		return this.find(query);
	}

	findOnlineUserFromList(userList) {
		const username = {
			$in: [].concat(userList),
		};

		const query = queryStatusAgentOnline({ username });

		return this.find(query);
	}

	getNextAgent() {
		const query = queryStatusAgentOnline();

		const collectionObj = this.model.rawCollection();
		const findAndModify = Meteor.wrapAsync(collectionObj.findAndModify, collectionObj);

		const sort = {
			livechatCount: 1,
			username: 1,
		};

		const update = {
			$inc: {
				livechatCount: 1,
			},
		};

		const user = findAndModify(query, sort, update);
		if (user && user.value) {
			return {
				agentId: user.value._id,
				username: user.value.username,
			};
		}
		return null;
	}

	getNextBotAgent() {
		const query = {
			roles: {
				$all: ['bot', 'livechat-agent'],
			},
		};

		const collectionObj = this.model.rawCollection();
		const findAndModify = Meteor.wrapAsync(collectionObj.findAndModify, collectionObj);

		const sort = {
			livechatCount: 1,
			username: 1,
		};

		const update = {
			$inc: {
				livechatCount: 1,
			},
		};

		const user = findAndModify(query, sort, update);
		if (user && user.value) {
			return {
				agentId: user.value._id,
				username: user.value.username,
			};
		}
		return null;
	}

	setLivechatStatus(userId, status) {
		const query = {
			_id: userId,
		};

		const update = {
			$set: {
				statusLivechat: status,
			},
		};

		return this.update(query, update);
	}

	setLivechatData(userId, data = {}) {
		const query = {
			_id: userId,
		};

		const update = {
			$set: {
				livechat: data,
			},
		};

		return this.update(query, update);
	}

	closeOffice() {
		this.findAgents().forEach((agent) => this.setLivechatStatus(agent._id, 'not-available'));
	}

	openOffice() {
		this.findAgents().forEach((agent) => this.setLivechatStatus(agent._id, 'available'));
	}

	getAgentInfo(agentId) {
		const query = {
			_id: agentId,
		};

		const options = {
			fields: {
				name: 1,
				username: 1,
				phone: 1,
				customFields: 1,
				status: 1,
				livechat: 1,
			},
		};

		if (settings.get('Livechat_show_agent_email')) {
			options.fields.emails = 1;
		}

		return this.findOne(query, options);
	}

	setTokenpassTcaBalances(_id, tcaBalances) {
		const update = {
			$set: {
				'services.tokenpass.tcaBalances': tcaBalances,
			},
		};

		return this.update(_id, update);
	}

	getTokenBalancesByUserId(userId) {
		const query = {
			_id: userId,
		};

		const options = {
			fields: {
				'services.tokenpass.tcaBalances': 1,
			},
		};

		return this.findOne(query, options);
	}

	roleBaseQuery(userId) {
		return { _id: userId };
	}

	setE2EPublicAndPrivateKeysByUserId(userId, { public_key, private_key }) {
		this.update({ _id: userId }, {
			$set: {
				'e2e.public_key': public_key,
				'e2e.private_key': private_key,
			},
		});
	}

	rocketMailUnsubscribe(_id, createdAt) {
		const query = {
			_id,
			createdAt: new Date(parseInt(createdAt)),
		};
		const update = {
			$set: {
				'mailer.unsubscribed': true,
			},
		};
		const affectedRows = this.update(query, update);
		console.log('[Mailer:Unsubscribe]', _id, createdAt, new Date(parseInt(createdAt)), affectedRows);
		return affectedRows;
	}

	fetchKeysByUserId(userId) {
		const user = this.findOne({ _id: userId }, { fields: { e2e: 1 } });

		if (!user || !user.e2e || !user.e2e.public_key) {
			return {};
		}

		return {
			public_key: user.e2e.public_key,
			private_key: user.e2e.private_key,
		};
	}

	disable2FAAndSetTempSecretByUserId(userId, tempToken) {
		return this.update({
			_id: userId,
		}, {
			$set: {
				'services.totp': {
					enabled: false,
					tempSecret: tempToken,
				},
			},
		});
	}

	enable2FAAndSetSecretAndCodesByUserId(userId, secret, backupCodes) {
		return this.update({
			_id: userId,
		}, {
			$set: {
				'services.totp.enabled': true,
				'services.totp.secret': secret,
				'services.totp.hashedBackup': backupCodes,
			},
			$unset: {
				'services.totp.tempSecret': 1,
			},
		});
	}

	disable2FAByUserId(userId) {
		return this.update({
			_id: userId,
		}, {
			$set: {
				'services.totp': {
					enabled: false,
				},
			},
		});
	}

	update2FABackupCodesByUserId(userId, backupCodes) {
		return this.update({
			_id: userId,
		}, {
			$set: {
				'services.totp.hashedBackup': backupCodes,
			},
		});
	}

	enableEmail2FAByUserId(userId) {
		return this.update({
			_id: userId,
		}, {
			$set: {
				'services.email2fa': {
					enabled: true,
					changedAt: new Date(),
				},
			},
		});
	}

	disableEmail2FAByUserId(userId) {
		return this.update({
			_id: userId,
		}, {
			$set: {
				'services.email2fa': {
					enabled: false,
					changedAt: new Date(),
				},
			},
		});
	}

	findByIdsWithPublicE2EKey(ids, options) {
		const query = {
			_id: {
				$in: ids,
			},
			'e2e.public_key': {
				$exists: 1,
			},
		};

		return this.find(query, options);
	}

	resetE2EKey(userId) {
		this.update({ _id: userId }, {
			$unset: {
				e2e: '',
			},
		});
	}

	removeExpiredEmailCodesOfUserId(userId) {
		this.update({ _id: userId }, {
			$pull: {
				'services.emailCode': {
					expire: { $lt: new Date() },
				},
			},
		});
	}

	removeEmailCodeByUserIdAndCode(userId, code) {
		this.update({ _id: userId }, {
			$pull: {
				'services.emailCode': {
					code,
				},
			},
		});
	}

	addEmailCodeByUserId(userId, code, expire) {
		this.update({ _id: userId }, {
			$push: {
				'services.emailCode': {
					$each: [{
						code,
						expire,
					}],
					$slice: -5,
				},
			},
		});
	}

	findUsersInRoles(roles, scope, options) {
		roles = [].concat(roles);

		const query = {
			roles: { $in: roles },
		};

		return this.find(query, options);
	}

	findOneByAppId(appId, options) {
		const query = { appId };

		return this.findOne(query, options);
	}

	findOneByImportId(_id, options) {
		return this.findOne({ importIds: _id }, options);
	}

	findOneByUsernameIgnoringCase(username, options) {
		if (typeof username === 'string') {
			username = new RegExp(`^${ s.escapeRegExp(username) }$`, 'i');
		}

		const query = { username };

		return this.findOne(query, options);
	}

	findOneByUsernameAndServiceNameIgnoringCase(username, userId, serviceName, options) {
		if (typeof username === 'string') {
			username = new RegExp(`^${ s.escapeRegExp(username) }$`, 'i');
		}

		const query = { username, [`services.${ serviceName }.id`]: userId };

		return this.findOne(query, options);
	}

	findOneByUsername(username, options) {
		const query = { username };

		return this.findOne(query, options);
	}

	findOneByEmailAddress(emailAddress, options) {
		const query = { 'emails.address': String(emailAddress).trim().toLowerCase() };

		return this.findOne(query, options);
	}

	findOneAdmin(admin, options) {
		const query = { admin };

		return this.findOne(query, options);
	}

	findOneByIdAndLoginToken(_id, token, options) {
		const query = {
			_id,
			'services.resume.loginTokens.hashedToken': Accounts._hashLoginToken(token),
		};

		return this.findOne(query, options);
	}

	findOneById(userId, options) {
		const query = { _id: userId };

		return this.findOne(query, options);
	}

	findOneByIdOrUsername(idOrUsername, options) {
		const query = {
			$or: [{
				_id: idOrUsername,
			}, {
				username: idOrUsername,
			}],
		};

		return this.findOne(query, options);
	}

	// FIND
	findByIds(users, options) {
		const query = { _id: { $in: users } };
		return this.find(query, options);
	}

	findNotOfflineByIds(users, options) {
		const query = {
			_id: { $in: users },
			status: {
				$in: ['online', 'away', 'busy'],
			},
		};
		return this.find(query, options);
	}

	findUsersNotOffline(options) {
		const query = {
			username: {
				$exists: 1,
			},
			status: {
				$in: ['online', 'away', 'busy'],
			},
		};

		return this.find(query, options);
	}

	findNotIdUpdatedFrom(uid, from, options) {
		const query = {
			_id: { $ne: uid },
			username: {
				$exists: 1,
			},
			_updatedAt: { $gte: from },
		};

		return this.find(query, options);
	}

	findByRoomId(rid, options) {
		const data = Subscriptions.findByRoomId(rid).fetch().map((item) => item.u._id);
		const query = {
			_id: {
				$in: data,
			},
		};

		return this.find(query, options);
	}

	findByUsername(username, options) {
		const query = { username };

		return this.find(query, options);
	}

	findActive(options = {}) {
		return this.find({
			active: true,
			type: { $nin: ['app'] },
			roles: { $ne: ['guest'] },
		}, options);
	}

	findActiveLocalGuests(idExceptions = [], options = {}) {
		const query = {
			active: true,
			type: { $nin: ['app'] },
			roles: {
				$eq: 'guest',
				$size: 1,
			},
			isRemote: { $ne: true },
		};

		if (idExceptions) {
			if (!_.isArray(idExceptions)) {
				idExceptions = [idExceptions];
			}

			query._id = { $nin: idExceptions };
		}

		return this.find(query, options);
	}

	findByActiveUsersExcept(searchTerm, exceptions, options, forcedSearchFields, extraQuery = []) {
		if (exceptions == null) { exceptions = []; }
		if (options == null) { options = {}; }
		if (!_.isArray(exceptions)) {
			exceptions = [exceptions];
		}

		// if the search term is empty, don't need to have the $or statement (because it would be an empty regex)
		if (searchTerm === '') {
			const query = {
				$and: [
					{
						active: true,
						username: { $exists: true, $nin: exceptions },
					},
					...extraQuery,
				],
			};

			return this._db.find(query, options);
		}

		const termRegex = new RegExp(s.escapeRegExp(searchTerm), 'i');

		const searchFields = forcedSearchFields || settings.get('Accounts_SearchFields').trim().split(',');

		const orStmt = _.reduce(searchFields, function(acc, el) {
			acc.push({ [el.trim()]: termRegex });
			return acc;
		}, []);

		const query = {
			$and: [
				{
					active: true,
					username: { $exists: true, $nin: exceptions },
					$or: orStmt,
				},
				...extraQuery,
			],
		};

		// do not use cache
		return this._db.find(query, options);
	}

	findByActiveLocalUsersExcept(searchTerm, exceptions, options, forcedSearchFields, localDomain) {
		const extraQuery = [
			{
				$or: [
					{ federation: { $exists: false } },
					{ 'federation.origin': localDomain },
				],
			},
		];
		return this.findByActiveUsersExcept(searchTerm, exceptions, options, forcedSearchFields, extraQuery);
	}

	findByActiveExternalUsersExcept(searchTerm, exceptions, options, forcedSearchFields, localDomain) {
		const extraQuery = [
			{ federation: { $exists: true } },
			{ 'federation.origin': { $ne: localDomain } },
		];
		return this.findByActiveUsersExcept(searchTerm, exceptions, options, forcedSearchFields, extraQuery);
	}

	findUsersByNameOrUsername(nameOrUsername, options) {
		const query = {
			username: {
				$exists: 1,
			},

			$or: [
				{ name: nameOrUsername },
				{ username: nameOrUsername },
			],

			type: {
				$in: ['user'],
			},
		};

		return this.find(query, options);
	}

	findByUsernameNameOrEmailAddress(usernameNameOrEmailAddress, options) {
		const query = {
			$or: [
				{ name: usernameNameOrEmailAddress },
				{ username: usernameNameOrEmailAddress },
				{ 'emails.address': usernameNameOrEmailAddress },
			],
			type: {
				$in: ['user', 'bot'],
			},
		};

		return this.find(query, options);
	}

	findLDAPUsers(options) {
		const query = { ldap: true };

		return this.find(query, options);
	}

	findCrowdUsers(options) {
		const query = { crowd: true };

		return this.find(query, options);
	}

	getLastLogin(options) {
		if (options == null) { options = {}; }
		const query = { lastLogin: { $exists: 1 } };
		options.sort = { lastLogin: -1 };
		options.limit = 1;
		const [user] = this.find(query, options).fetch();
		return user && user.lastLogin;
	}

	findUsersByUsernames(usernames, options) {
		const query = {
			username: {
				$in: usernames,
			},
		};

		return this.find(query, options);
	}

	findUsersByIds(ids, options) {
		const query = {
			_id: {
				$in: ids,
			},
		};
		return this.find(query, options);
	}

	findUsersWithUsernameByIds(ids, options) {
		const query = {
			_id: {
				$in: ids,
			},
			username: {
				$exists: 1,
			},
		};

		return this.find(query, options);
	}

	findUsersWithUsernameByIdsNotOffline(ids, options) {
		const query = {
			_id: {
				$in: ids,
			},
			username: {
				$exists: 1,
			},
			status: {
				$in: ['online', 'away', 'busy'],
			},
		};

		return this.find(query, options);
	}

	getOldest(fields = { _id: 1 }) {
		const query = {
			_id: {
				$ne: 'rocket.cat',
			},
		};

		const options = {
			fields,
			sort: {
				createdAt: 1,
			},
		};

		return this.findOne(query, options);
	}

	findRemote(options = {}) {
		return this.find({ isRemote: true }, options);
	}

	findActiveRemote(options = {}) {
		return this.find({
			active: true,
			isRemote: true,
			roles: { $ne: ['guest'] },
		}, options);
	}

	getSAMLByIdAndSAMLProvider(_id, provider) {
		return this.findOne({
			_id,
			'services.saml.provider': provider,
		}, {
			'services.saml': 1,
		});
	}

	// UPDATE
	addImportIds(_id, importIds) {
		importIds = [].concat(importIds);

		const query = { _id };

		const update = {
			$addToSet: {
				importIds: {
					$each: importIds,
				},
			},
		};

		return this.update(query, update);
	}

	updateInviteToken(_id, inviteToken) {
		const update = {
			$set: {
				inviteToken,
			},
		};

		return this.update(_id, update);
	}

	updateStatusText(_id, statusText) {
		const update = {
			$set: {
				statusText,
			},
		};

		return this.update(_id, update);
	}

	updateLastLoginById(_id) {
		const update = {
			$set: {
				lastLogin: new Date(),
			},
		};

		return this.update(_id, update);
	}

	updateStatusById(_id, status) {
		const update = {
			$set: {
				status,
			},
		};

		return this.update(_id, update);
	}

	setServiceId(_id, serviceName, serviceId) {
		const update =		{ $set: {} };

		const serviceIdKey = `services.${ serviceName }.id`;
		update.$set[serviceIdKey] = serviceId;

		return this.update(_id, update);
	}

	setUsername(_id, username) {
		const update =		{ $set: { username } };

		return this.update(_id, update);
	}

	setEmail(_id, email) {
		const update = {
			$set: {
				emails: [{
					address: email,
					verified: false,
				},
				],
			},
		};

		return this.update(_id, update);
	}

	setEmailVerified(_id, email) {
		const query = {
			_id,
			emails: {
				$elemMatch: {
					address: email,
					verified: false,
				},
			},
		};

		const update = {
			$set: {
				'emails.$.verified': true,
			},
		};

		return this.update(query, update);
	}

	setName(_id, name) {
		const update = {
			$set: {
				name,
			},
		};

		return this.update(_id, update);
	}

	unsetName(_id) {
		const update = {
			$unset: {
				name,
			},
		};

		return this.update(_id, update);
	}

	setCustomFields(_id, fields) {
		const values = {};
		Object.keys(fields).forEach((key) => {
			values[`customFields.${ key }`] = fields[key];
		});

		const update = { $set: values };

		return this.update(_id, update);
	}

	setAvatarOrigin(_id, origin) {
		const update = {
			$set: {
				avatarOrigin: origin,
			},
		};

		return this.update(_id, update);
	}

	unsetAvatarOrigin(_id) {
		const update = {
			$unset: {
				avatarOrigin: 1,
			},
		};

		return this.update(_id, update);
	}

	setUserActive(_id, active) {
		if (active == null) { active = true; }
		const update = {
			$set: {
				active,
			},
		};

		return this.update(_id, update);
	}

	setAllUsersActive(active) {
		const update = {
			$set: {
				active,
			},
		};

		return this.update({}, update, { multi: true });
	}

	setActiveNotLoggedInAfterWithRole(latestLastLoginDate, role = 'user', active = false) {
		const neverActive = { lastLogin: { $exists: 0 }, createdAt: { $lte: latestLastLoginDate } };
		const idleTooLong = { lastLogin: { $lte: latestLastLoginDate } };

		const query = {
			$or: [neverActive, idleTooLong],
			active: true,
			roles: role,
		};

		const update = {
			$set: {
				active,
			},
		};

		return this.update(query, update, { multi: true });
	}

	unsetLoginTokens(_id) {
		const update = {
			$set: {
				'services.resume.loginTokens': [],
			},
		};

		return this.update(_id, update);
	}

	unsetRequirePasswordChange(_id) {
		const update = {
			$unset: {
				requirePasswordChange: true,
				requirePasswordChangeReason: true,
			},
		};

		return this.update(_id, update);
	}

	resetPasswordAndSetRequirePasswordChange(_id, requirePasswordChange, requirePasswordChangeReason) {
		const update = {
			$unset: {
				'services.password': 1,
			},
			$set: {
				requirePasswordChange,
				requirePasswordChangeReason,
			},
		};

		return this.update(_id, update);
	}

	setLanguage(_id, language) {
		const update = {
			$set: {
				language,
			},
		};

		return this.update(_id, update);
	}

	setProfile(_id, profile) {
		const update = {
			$set: {
				'settings.profile': profile,
			},
		};

		return this.update(_id, update);
	}

	setBio(_id, bio = '') {
		const update = {
			...bio.trim() ? {
				$set: {
					bio,
				},
			} : {
				$unset: {
					bio: 1,
				},
			},
		};
		return this.update(_id, update);
	}

	clearSettings(_id) {
		const update = {
			$set: {
				settings: {},
			},
		};

		return this.update(_id, update);
	}

	setPreferences(_id, preferences) {
		const settingsObject = Object.assign(
			{},
			...Object.keys(preferences).map((key) => ({ [`settings.preferences.${ key }`]: preferences[key] })),
		);

		const update = {
			$set: settingsObject,
		};
		if (parseInt(preferences.clockMode) === 0) {
			delete update.$set['settings.preferences.clockMode'];
			update.$unset = { 'settings.preferences.clockMode': 1 };
		}

		return this.update(_id, update);
	}

	setTwoFactorAuthorizationHashAndUntilForUserIdAndToken(_id, token, hash, until) {
		return this.update({
			_id,
			'services.resume.loginTokens.hashedToken': token,
		}, {
			$set: {
				'services.resume.loginTokens.$.twoFactorAuthorizedHash': hash,
				'services.resume.loginTokens.$.twoFactorAuthorizedUntil': until,
			},
		});
	}

	setUtcOffset(_id, utcOffset) {
		const query = {
			_id,
			utcOffset: {
				$ne: utcOffset,
			},
		};

		const update = {
			$set: {
				utcOffset,
			},
		};

		return this.update(query, update);
	}

	saveUserById(_id, data) {
		const setData = {};
		const unsetData = {};

		if (data.name != null) {
			if (!_.isEmpty(s.trim(data.name))) {
				setData.name = s.trim(data.name);
			} else {
				unsetData.name = 1;
			}
		}

		if (data.email != null) {
			if (!_.isEmpty(s.trim(data.email))) {
				setData.emails = [{ address: s.trim(data.email) }];
			} else {
				unsetData.emails = 1;
			}
		}

		if (data.phone != null) {
			if (!_.isEmpty(s.trim(data.phone))) {
				setData.phone = [{ phoneNumber: s.trim(data.phone) }];
			} else {
				unsetData.phone = 1;
			}
		}

		const update = {};

		if (!_.isEmpty(setData)) {
			update.$set = setData;
		}

		if (!_.isEmpty(unsetData)) {
			update.$unset = unsetData;
		}

		if (_.isEmpty(update)) {
			return true;
		}

		return this.update({ _id }, update);
	}

	setReason(_id, reason) {
		const update = {
			$set: {
				reason,
			},
		};

		return this.update(_id, update);
	}

	unsetReason(_id) {
		const update = {
			$unset: {
				reason: true,
			},
		};

		return this.update(_id, update);
	}

	bannerExistsById(_id, bannerId) {
		const query = {
			_id,
			[`banners.${ bannerId }`]: {
				$exists: true,
			},
		};

		return this.find(query).count() !== 0;
	}

	addBannerById(_id, banner) {
		const query = {
			_id,
			[`banners.${ banner.id }.read`]: {
				$ne: true,
			},
		};

		const update = {
			$set: {
				[`banners.${ banner.id }`]: banner,
			},
		};

		return this.update(query, update);
	}

	setBannerReadById(_id, bannerId) {
		const update = {
			$set: {
				[`banners.${ bannerId }.read`]: true,
			},
		};

		return this.update({ _id }, update);
	}

	removeBannerById(_id, banner) {
		const update = {
			$unset: {
				[`banners.${ banner.id }`]: true,
			},
		};

		return this.update({ _id }, update);
	}

	removeResumeService(_id) {
		const update = {
			$unset: {
				'services.resume': '',
			},
		};

		return this.update({ _id }, update);
	}

	updateDefaultStatus(_id, statusDefault) {
		return this.update({
			_id,
			statusDefault: { $ne: statusDefault },
		}, {
			$set: {
				statusDefault,
			},
		});
	}

	// INSERT
	create(data) {
		const user = {
			createdAt: new Date(),
			avatarOrigin: 'none',
		};

		_.extend(user, data);

		return this.insert(user);
	}


	// REMOVE
	removeById(_id) {
		return this.remove(_id);
	}

	removeLivechatData(userId) {
		const query = {
			_id: userId,
		};

		const update = {
			$unset: {
				livechat: true,
			},
		};

		return this.update(query, update);
	}

	/*
Find users to send a message by email if:
- he is not online
- has a verified email
- has not disabled email notifications
- `active` is equal to true (false means they were deactivated and can't login)
*/
	getUsersToSendOfflineEmail(usersIds) {
		const query = {
			_id: {
				$in: usersIds,
			},
			active: true,
			status: 'offline',
			statusConnection: {
				$ne: 'online',
			},
			'emails.verified': true,
		};

		const options = {
			fields: {
				name: 1,
				username: 1,
				emails: 1,
				'settings.preferences.emailNotificationMode': 1,
				language: 1,
			},
		};

		return this.find(query, options);
	}

	getActiveLocalUserCount() {
		return this.findActive().count() - this.findActiveRemote().count();
	}

	getActiveLocalGuestCount(idExceptions = []) {
		return this.findActiveLocalGuests(idExceptions).count();
	}

	removeOlderResumeTokensByUserId(userId, fromDate) {
		this.update(userId, {
			$pull: {
				'services.resume.loginTokens': {
					when: { $lt: fromDate },
				},
			},
		});
	}
}

export default new Users(Meteor.users, true);
