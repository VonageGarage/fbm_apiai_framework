const TOKENS_DB_NAME = "Tokens"

class TokenDB {

	constructor (db) {
		this.db = db
    } 
    
    saveAccessToken(companyData) {
		let self = this
		return new Promise(resolve => {
			var companyRef = self.db.ref(TOKENS_DB_NAME).child(companyData['id'])
			companyRef.set(companyData)
			resolve(companyData)
		})
	
	}

	getAccessToken(communityId) {
		let self = this
		return new Promise( resolve => {
			if (!communityId) {
				resolve()
				return
			}
			var usersRef = self.db.ref(TOKENS_DB_NAME).child(communityId)
			usersRef.once("value")
				.then(snapshot => {
					var value = snapshot.val()
					resolve(value)
				}).catch(error => {
					resolve()
				})
		})
	}

	removeAccessToken(communityId) {
		let self = this
		return new Promise( resolve => {    
			var tokenRef = self.db.ref(TOKENS_DB_NAME).child(communityId)
			tokenRef.remove()
			resolve(communityId)
		})
	}


}


//var sessionsDB = new SessionsDB()
module.exports = TokenDB
