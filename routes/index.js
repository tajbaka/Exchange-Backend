var express = require('express');
var router = express.Router();

const admin = require('firebase-admin');
var serviceAccount = require("../serviceAccountKey.json");

const nodemailer = require("nodemailer");
const moment = require('moment'); 

const axios = require('axios').default;
var AWS = require('aws-sdk');

const fs = require('fs');
const util = require('util');
const linear16 = require('linear16');

const speech = require('@google-cloud/speech');
const textToSpeech = require('@google-cloud/text-to-speech');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://exchange-ce527.firebaseio.com",
  storageBucket: "exchange-ce527.appspot.com"
});

router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

const es = {
  newMessage: 'Nuevo mensaje de',
}

const en = {
  newMessage: 'New message from',
}

const Languages = {
  en,
  es
}

const speechClient = new speech.SpeechClient();
const textToSpeechClient = new textToSpeech.TextToSpeechClient();

// router.post('/signin', function(req, res, next) {
//   const { body } = req;
//   const { idToken } = body;
//   admin.auth().verifyIdToken(idToken).then(decodedToken => {
//     const userUid = decodedToken.uid;
//     res.send(userUid);
//   }).catch(error => {
//     next(error);
//   });
// });

router.post('/check-user-exists', function(req, res, next) {
  const { body } = req;
  const { usernameValue } = body;
  let exists = false;

  listAllUsers().then(listUsersResult => {
    listUsersResult.users.forEach((userRecord) => {
      const userEmail = userRecord.toJSON().email;
      if(userEmail.toLowerCase() === usernameValue.toLowerCase()){
        exists = true;
      }
    });
    res.send(exists)  
  });
});

function listAllUsers(nextPageToken) {
  return new Promise((resolve, reject) => {
    if(nextPageToken !== undefined){
      admin.auth().listUsers(1000).then((listUsersResult, nextPageToken) => {
        if (listUsersResult.pageToken) {
          // List next batch of users.
          listAllUsers(listUsersResult.pageToken);
        }
        else {
          resolve(listUsersResult);
        }
      }).catch((error) => {
        console.log('Error listing users:', error);
      });
    }
    else {
      admin.auth().listUsers(1000).then((listUsersResult) => {
        if (listUsersResult.pageToken) {
          // List next batch of users.
          listAllUsers(listUsersResult.pageToken);
        }
        else {
          resolve(listUsersResult);
        }
      }).catch((error) => {
        console.log('Error listing users:', error);
      });
    }
  });
}

router.post('/create-account', function(req, res, next) {
  const { body } = req;
  const { name, spokenLanguage, learningLanguage, email, userUid, createdOn, images } = body;

  const accountSettings = {
    name,
    spokenLanguage,
    learningLanguage,
    spokenLanguage,
    userUid,
    images,
    email,
    createdOn
  }

  if(userUid !== undefined){
    admin.database().ref(`/users/${userUid}`).set({ accountSettings }).then(() => {
      res.send(userUid);
    }).catch((error) => {
      next(error);
    });
  }
});

router.post('/update-learning-language', function(req, res, next) {
  const { body } = req;
  const { userUid, learningLanguage } = body;

  if(userUid !== undefined){
    admin.database().ref(`/users/${userUid}/accountSettings`).update({ learningLanguage }).then(() => {
      res.send('success');
    }).catch((error) => {
      next(error);
    });
  }
});

router.post('/update-spoken-language', function(req, res, next) {
  const { body } = req;
  const { userUid, spokenLanguage } = body;

  if(userUid !== undefined){
    admin.database().ref(`/users/${userUid}/accountSettings`).update({ spokenLanguage }).then(() => {
      res.send('success');
    }).catch((error) => {
      next(error);
    });
  }
});

router.post('/login', function(req, res, next) {
  const { body } = req;
  const { userUid, lastLogin } = body;
  if(userUid !== undefined){
    admin.database().ref(`/users/${userUid}/accountSettings`).update({ lastLogin }).then(() => {
      res.send('success');
    }).catch((error) => {
      next(error);
    });
  }
});

router.post('/update-fcm-token', function(req, res, next) {
  const { body } = req;
  const { userUid, fcmToken } = body;
  if(userUid !== undefined && fcmToken !== undefined && fcmToken !== null){
    admin.database().ref(`/users/${userUid}/accountSettings`).update({ fcmToken }).then(() => {
      res.send('success');
    }).catch((error) => {
      next(error);
    });
  }
  else {
    res.send('sorry');
  }
});

router.post('/update-name', function(req, res, next) {
  const { body } = req;
  const { userUid } = body;
  let { name } = body;
  
  if(userUid !== undefined){
    name = name.charAt(0).toUpperCase() + name.slice(1)
    admin.database().ref(`/users/${userUid}/accountSettings`).update({ name }).then(() => {
      res.send('success');
    }).catch((error) => {
      next(error);
    });
  }
});

router.post('/typing-message', function(req, res, next) {
  const { body } = req;
  const { otherUserUid, id } = body;

  async function setTyping(typing) {
    admin.database().ref(`/users/${otherUserUid}/chatList/`).once('value').then(snapshot => {
      let chatList = snapshot.val();

      if(!chatList){
        chatList = [];
      }

      const index = chatList.findIndex(element => {
        if(element){
          return element.id === id;
        }
        else { 
          return false;
        }
      });

      let chatItem;
      if(index !== -1){
        chatItem = chatList[index];
        if(chatItem && chatItem.typing !== typing){
          admin.database().ref(`/users/${otherUserUid}/chatList/${index}/typing`).set(typing);
        }
      }
    });
  }

  setTyping(true);
  
  setTimeout(() => {
    setTyping(false);
    res.send('success');
  }, 5000);
  
});

router.post('/update-state-change', function(req, res, next) {
  const { body } = req;
  const { userUid, status } = body;

  if(userUid !== undefined){
    admin.database().ref(`/users/${userUid}/accountSettings/status/`).set(status).then(() => {
      res.send('done')
    }).catch((error) => {
        next(error);
    });
  }
});

router.post('/update-chat-user-state-change', function(req, res, next) {
  const { body } = req;
  const { status, id, otherUserUid } = body;

  if(otherUserUid !== undefined){
    admin.database().ref(`/users/${otherUserUid}/chatList/`).once('value').then(snapshot => {
      let chatList = snapshot.val();

      if(!chatList){
        chatList = [];
      }

      const index = chatList.findIndex(element => {
        if(element){
          return element.id === id;
        }
        else { 
          return false;
        }
      });

      let chatItem;
      if(index !== -1){
        chatItem = chatList[index];
        if(chatItem && chatItem.status !== status){
          admin.database().ref(`/users/${otherUserUid}/chatList/${index}/status`).set(status);
        }
      }
    });
  }
});

router.post('/send-message', function(req, respond, next) {
  const { body } = req;
  const { id, content, otherUserUid, userUid } = body;

    if(content.length > 0){
      const firstPromises = [];
      firstPromises.push(admin.database().ref(`/users/${userUid}/`).once('value'));
      firstPromises.push(admin.database().ref(`/users/${otherUserUid}/`).once('value'));
      
      let spokenLanguage;
      let learningLanguage;
      let otherUsersSettings;
      let accountSettings;

      Promise.all(firstPromises).then(res => {
        const firstRes = res[0].val();
        const secondRes = res[1].val();
        let chatList = firstRes.chatList;
        accountSettings = firstRes.accountSettings;
        spokenLanguage = accountSettings.spokenLanguage;
        learningLanguage = accountSettings.learningLanguage;
        let language = spokenLanguage;
        otherUsersSettings = secondRes.accountSettings;
        let otherUserChatList = secondRes.chatList;

        let isSwitched;
        
        detectLanguage({ content, spokenLanguage }).then(detectedLanguage => {
          if(detectedLanguage === spokenLanguage){
            isSwitched = false;
          }
          else if (detectedLanguage === learningLanguage){ 
            isSwitched = true;
          }

          const obj = { 
            content, 
            spokenLanguage, 
            learningLanguage: learningLanguage === 'none' ? otherUsersSettings.spokenLanguage : learningLanguage, 
            isSwitched
          }

          changeTranslationChatText(obj).then((translatedContent) => {
            if(!chatList){
              chatList = [];
            }
            
            const randLetter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
            const uniqueId = randLetter + Date.now();
  
            const index = chatList.findIndex(element => {
              if(element !== undefined){
                return element.id === id
              }
              else {
                return false;
              }
            });
            
            let chatItem;
  
            const date = moment();
            const unixTime = date.unix();
  
            if(index === -1){
              chatItem = {
                id,
                otherUsersSettings,
                name: otherUsersSettings.name,
                unRead: 0,
                lastMessage: unixTime,
                typing: false
              };
            }
            else { 
              chatItem = chatList[index];
              chatItem.otherUsersSettings = otherUsersSettings;
              chatItem.lastMessage = unixTime;
              chatItem.unRead = 0;
            }
  
            if(isSwitched){
              language = learningLanguage;
            }
  
            const chatObj = {
              id: uniqueId,
              userUid: accountSettings.userUid,
              content,
              translatedContent: learningLanguage === 'none' ? content : translatedContent,
              showTranslatedContent: learningLanguage === 'none' ? false : true,
              date: unixTime,
              language
            }
  
            if(index === -1){
              chatItem.detailedChatList = [chatObj];
              chatList.push(chatItem);
            }
            else {
              chatItem.detailedChatList.push(chatObj);
              const detailedChatListLength = chatItem.detailedChatList.length;
              if(detailedChatListLength > 20){
                chatItem.detailedChatList = chatItem.detailedChatList.slice(detailedChatListLength - 20);
              }
            }
  
            if(!otherUserChatList){
              otherUserChatList = [];
            }
  
            const otherUserChatListIndex = otherUserChatList.findIndex(otherUserElement => {
              if(otherUserElement){
                return otherUserElement.id === id;
              }
              else {
                return false;
              }
            });
  
            let otherUserChatItem;
  
            if(otherUserChatListIndex === -1){
              otherUserChatItem = {
                id,
                otherUsersSettings: accountSettings,
                name: accountSettings.name,
                lastMessage: unixTime,
                unRead: 1        
              };
            }
            else { 
              otherUserChatItem = otherUserChatList[otherUserChatListIndex];
              otherUserChatItem.otherUsersSettings = accountSettings;
              otherUserChatItem.lastMessage = unixTime;
              let unread = otherUserChatItem.unRead + 1;
              if(unread > 20){
                unread = 20;
              }
              otherUserChatItem.unRead = unread;
            }
  
            const otherChatObj = JSON.parse(JSON.stringify(chatObj));
            const otherUsersLearningLanguage = otherUsersSettings.learningLanguage;
            let newTranslatedContent = translatedContent;
          
            if(otherUsersLearningLanguage !== language){
              newTranslatedContent = null;
            }
  
            otherChatObj.showTranslatedContent = false;
            otherChatObj.content = content;
            otherChatObj.translatedContent = newTranslatedContent;
            
            if(otherUserChatListIndex === -1){
              otherUserChatItem.detailedChatList = [otherChatObj];
              otherUserChatList.push(otherUserChatItem);
            }
            else {
              otherUserChatItem.typing = false;
              otherUserChatItem.detailedChatList.push(otherChatObj);
              const otherUserDetailedChatListLength = otherUserChatItem.detailedChatList.length;
              if(otherUserDetailedChatListLength > 20){
                otherUserChatItem.detailedChatList = otherUserChatItem.detailedChatList.slice(otherUserDetailedChatListLength - 20)
              }
            }
  
            const payload = {
              notification: {
                title: Languages[otherUsersSettings.spokenLanguage].newMessage + ' ' + accountSettings.name,
                color: "#007aff",
                sound : "default",
                tag: userUid + '-' + otherUserUid
              },
              data: {
                name: accountSettings.name,
                title: accountSettings.name,
                content: isSwitched ? translatedContent: content,
                id: chatItem.id,
                shortId: chatItem.id.substring(1, 11),
                otherUsersSettings: JSON.stringify(accountSettings),
              }
            };
  
            const options = {
              priority: 'high',
              collapse_key: '123'
            };
  
            const secondPromises = [];
  
            secondPromises.push(admin.database().ref(`/users/${accountSettings.userUid}/chatList/${index}`).set(chatItem));
            secondPromises.push(admin.database().ref(`/users/${otherUsersSettings.userUid}/chatList/${otherUserChatListIndex}`).set(otherUserChatItem));
            secondPromises.push(admin.messaging().sendToDevice(otherUsersSettings.fcmToken, payload, options));
  
            Promise.all(secondPromises).then(() => {
              respond.send('success')
            }).catch((error) => {
              console.log(error, 'hey')
              next(error);
            });
          });
        });
    });
    }
    else {
      respond.send('nothing sent');
    }
});

const detectLanguage = (ref) => {
  return new Promise(async function(resolve, reject) {
      const { content, spokenLanguage } = ref;
      const API_KEY = 'AIzaSyAREhxB566smEG2sPyJLvNh6CWEROh5gZs';
      let detectionUrl = `https://translation.googleapis.com/language/translate/v2/detect?key=${API_KEY}`;
      const sendValue = content.replace(" ", "%20");
      detectionUrl += '&q=' + sendValue;
      let detectedLanguage;
      await axios.get(detectionUrl).then((response) => {
          detectedLanguage = response.data.data.detections[0][0].language;
      }).catch((err) => {
          detectedLanguage = spokenLanguage;
      });
      resolve(detectedLanguage);
  });
};

router.post('/send-voice-message', function(req, respond, next) {
  const { body } = req;
  const { id, voiceMessage, voiceMessageName, otherUserUid, userUid, uniqueId } = body;

  if(voiceMessage !== undefined){
    const firstPromises = [];
    firstPromises.push(admin.database().ref(`/users/${userUid}/`).once('value'));
    firstPromises.push(admin.database().ref(`/users/${otherUserUid}/`).once('value'));
    
    let spokenLanguage;
    let learningLanguage;
    let otherUsersSettings;
    let accountSettings;

    Promise.all(firstPromises).then(res => {
      const firstRes = res[0].val();
      const secondRes = res[1].val();
      let chatList = firstRes.chatList;
      accountSettings = firstRes.accountSettings;
      spokenLanguage = accountSettings.spokenLanguage;
      learningLanguage = accountSettings.learningLanguage;
      let language = spokenLanguage;
      otherUsersSettings = secondRes.accountSettings;
      let otherUserChatList = secondRes.chatList;

      const obj = {
        voiceMessageName,
        spokenLanguage,
        userUid,
        learningLanguage: learningLanguage === 'none' ? otherUsersSettings.spokenLanguage : learningLanguage
      }

      changeTranslationVoice(obj).then((response) => {
        const { translatedContent, content, isSwitched } = response;
        if(translatedContent !== undefined){
          obj.content = content;
          obj.isSwitched = isSwitched;
          if(!chatList){
            chatList = [];
          }
          const index = chatList.findIndex(element => {
            if(element !== undefined){
              return element.id === id
            }
            else {
              return false;
            }
          });
          
          let chatItem;

          const date = moment();
          const unixTime = date.unix();

          if(index === -1){
            chatItem = {
              id,
              otherUsersSettings,
              name: otherUsersSettings.name,
              unRead: 0,
              lastMessage: unixTime,
              typing: false
            };
          }
          else { 
            chatItem = chatList[index];
            chatItem.otherUsersSettings = otherUsersSettings;
            chatItem.lastMessage = unixTime;
            chatItem.unRead = 0;
          }

          if(isSwitched){
            language = learningLanguage;
          }

          const chatObj = {
            id: uniqueId,
            userUid: accountSettings.userUid,
            content,
            voiceMessage,
            translatedContent: learningLanguage === 'none' ? content : translatedContent,
            showTranslatedContent: learningLanguage === 'none' ? false : true,
            date: unixTime,
            language
          }

          if(index === -1){
            chatItem.detailedChatList = [chatObj];
            chatList.push(chatItem);
          }
          else {
            chatItem.detailedChatList.push(chatObj);
            const detailedChatListLength = chatItem.detailedChatList.length;
            if(detailedChatListLength > 20){
              chatItem.detailedChatList = chatItem.detailedChatList.slice(detailedChatListLength - 20);
            }
          }

          if(!otherUserChatList){
            otherUserChatList = [];
          }

          const otherUserChatListIndex = otherUserChatList.findIndex(otherUserElement => {
            if(otherUserElement){
              return otherUserElement.id === id;
            }
            else {
              return false;
            }
          });

          let otherUserChatItem;

          if(otherUserChatListIndex === -1){
            otherUserChatItem = {
              id,
              otherUsersSettings: accountSettings,
              name: accountSettings.name,
              lastMessage: unixTime,
              unRead: 1        
            };
          }
          else { 
            otherUserChatItem = otherUserChatList[otherUserChatListIndex];
            otherUserChatItem.otherUsersSettings = accountSettings;
            otherUserChatItem.lastMessage = unixTime;
            let unread = otherUserChatItem.unRead + 1;
            if(unread > 20){
              unread = 20;
            }
            otherUserChatItem.unRead = unread;
          }

          const otherChatObj = JSON.parse(JSON.stringify(chatObj));
          const otherUsersLearningLanguage = otherUsersSettings.learningLanguage;

          let newTranslatedContent = translatedContent;
        
          if(otherUsersLearningLanguage !== language){
            newTranslatedContent = null;
          }

          otherChatObj.showTranslatedContent = false;
          otherChatObj.content = content;
          otherChatObj.translatedContent = newTranslatedContent;
          otherChatObj.voiceMessage = voiceMessage;
          
          if(otherUserChatListIndex === -1){
            otherUserChatItem.detailedChatList = [otherChatObj];
            otherUserChatList.push(otherUserChatItem);
          }
          else {
            otherUserChatItem.typing = false;
            otherUserChatItem.detailedChatList.push(otherChatObj);
            const otherUserDetailedChatListLength = otherUserChatItem.detailedChatList.length;
            if(otherUserDetailedChatListLength > 20){
              otherUserChatItem.detailedChatList = otherUserChatItem.detailedChatList.slice(otherUserDetailedChatListLength - 20)
            }
          }

          const payload = {
            notification: {
              title: Languages[otherUsersSettings.spokenLanguage].newMessage + ' ' + accountSettings.name,
              color: "#007aff",
              sound : "default",
              tag: userUid + '-' + otherUserUid
            },
            data: {
              name: accountSettings.name,
              title: accountSettings.name,
              content: isSwitched ? translatedContent: content,
              id: chatItem.id,
              tag: chatItem.id,
              otherUsersSettings: JSON.stringify(accountSettings),
            }
          };

          const options = {
            priority: 'high',
            collapse_key: '123'
          };

          const secondPromises = [];

          secondPromises.push(admin.database().ref(`/users/${accountSettings.userUid}/chatList/`).set(chatList));
          secondPromises.push(admin.database().ref(`/users/${otherUsersSettings.userUid}/chatList/`).set(otherUserChatList));
          secondPromises.push(admin.messaging().sendToDevice(otherUsersSettings.fcmToken, payload, options));

          Promise.all(secondPromises).then(() => {
            respond.send('success')
          }).catch((error) => {
            console.log(error, 'hey')
            next(error);
          });
        }
        else {
          console.log('sending that error1')
          respond.send('error')
        }
      }).catch(() => {
        console.log('sending that error2')
        respond.send('error')
      });
  });
  }
  else {
    respond.send('nothing sent');
  }
  
});

const changeTranslationChatText = (ref) => {
  return new Promise(async function(resolve, reject) {
      const { content, spokenLanguage, learningLanguage, isSwitched } = ref;

      const API_KEY = 'AIzaSyAREhxB566smEG2sPyJLvNh6CWEROh5gZs';

      const format = 'text'
      let url = `https://translation.googleapis.com/language/translate/v2?key=${API_KEY}`;
      url += '&q=' + encodeURI(content);

      if(isSwitched){
          url += `&source=${learningLanguage}`;
          url += `&target=${spokenLanguage}`;
      }
      else {
          url += `&source=${spokenLanguage}`;
          url += `&target=${learningLanguage}`;
      }
     
      url += `&format=${format}`;
      if(learningLanguage !== 'none'){
          if(content && content.length > 0){
            axios.post(url).then((response) => {
              const translatedContent = response.data.data.translations[0].translatedText;
              resolve(translatedContent);
            }).catch((error) => { 
              reject(error)
            });
          }
          else {
            resolve();
          }
      }
      else {
        resolve(content);
      }
  });
};

const changeTranslationVoice = (ref) => {
  return new Promise(function(resolve, reject) {
    const { learningLanguage, spokenLanguage, userUid, voiceMessageName } = ref;

    const params = {
      Bucket: myBucket, 
      Key: voiceMessageName
    };

    (async () => {
      const data = await s3.getObject(params).promise();
      fs.writeFileSync(`${userUid}.m4a`, data.Body);

      let file = await linear16(`./${userUid}.m4a`, `./${userUid}.raw`);
      file = fs.readFileSync(`${userUid}.raw`);
      var audioBytes = file.toString('base64');

      const audio = {
        content: audioBytes,
      };
      const config = {
        enableAutomaticPunctuation: true,
        encoding: 'LINEAR16',
        languageCode: 'en-US',
        sampleRateHertz: 16000
      };

      const request = {
        audio: audio,
        config: config,
      };

      // Detects speech in the audio file
      const [response] = await speechClient.recognize(request);
      let content = response.results.map(result => result.alternatives[0].transcript).join('\n');
      console.log(`Transcription: ${content}`);
      if(content === undefined){
        resolve()
      }
      else {
        content = content.toLowerCase();
        let isSwitched = false;
        const obj = { 
          content, 
          spokenLanguage, 
          learningLanguage,
          isSwitched
        } 
        changeTranslationChatText(obj).then((translatedContent) => {
          resolve({ content, translatedContent, isSwitched });
        });
      }
    })();
  });
};

router.post('/text-to-speech', function(req, res, next) {
  const { body } = req;
  const { userUid, presignedUrl, chatItemId, chatDetailItemId, content, language } = body;

  admin.database().ref(`/users/${userUid}/chatList`).once('value').then(snapshot => {
    const chatList = snapshot.val();
    const chatItemIndex = chatList.findIndex((o) => o.id === chatItemId);
    const chatItem = chatList[chatItemIndex];
    const chatDetailItemIndex = chatItem.detailedChatList.findIndex((o) => o.id === chatDetailItemId);
    const chatDetailItem = chatItem.detailedChatList[chatDetailItemIndex];
    const recording = chatDetailItem.recording;

    if(recording === undefined){
        (async () => {
          const text = content;
      
          let voice = {
            languageCode: "en-US",
            name: "en-US-Wavenet-D"
          }
      
          let audioConfig = {
            audioEncoding: 'MP3',
            pitch: -2.80,
            speakingRate: 0.90
          }
      
          if(language === 'es'){
            voice = {
              languageCode: "es-ES",
              name: "es-ES-Standard-A"
            }
      
            audioConfig = {
              audioEncoding: 'MP3',
              pitch: -2.80,
              speakingRate: 0.90
            }
          }
      
          const request = {
            input: {text: text},
            voice,
            audioConfig
          };
      
          const [response] = await textToSpeechClient.synthesizeSpeech(request);
          const audioContent = response.audioContent;
      
          axios.put(presignedUrl, audioContent).then((response) => {
            chatDetailItem.recording = presignedUrl.split("?")[0];
            admin.database().ref(`/users/${userUid}/chatList/${chatItemIndex}/detailedChatList/${chatDetailItemIndex}`).set(chatDetailItem).then(() => {
              res.send(chatDetailItem.recording)
            }).catch((error) => {
                next(error);
            });
          }).catch((error) => {
            next(error);
          });
        })();
    }
    else {
      admin.database().ref(`/users/${userUid}/chatList/${chatItemIndex}/detailedChatList/${chatDetailItemIndex}`).set(chatDetailItem).then(() => {
        res.send(chatDetailItem.recording)
      }).catch((error) => {
          next(error);
      });
    }
  });
});

router.post('/chat-item-click', function(req, res, next) {
  const { body } = req;
  const { userUid, chatItemId, chatDetailItemId } = body;

  admin.database().ref(`/users/${userUid}/chatList`).once('value').then(snapshot => {
    const chatList = snapshot.val();

    const chatItemIndex = chatList.findIndex((o) => o.id === chatItemId);
    const chatItem = chatList[chatItemIndex];
    const chatDetailItemIndex = chatItem.detailedChatList.findIndex((o) => o.id === chatDetailItemId);
    const chatDetailItem = chatItem.detailedChatList[chatDetailItemIndex];
    const showTranslatedContent = !chatDetailItem.showTranslatedContent;
    
    admin.database().ref(`/users/${userUid}/chatList/${chatItemIndex}/detailedChatList/${chatDetailItemIndex}/showTranslatedContent`).set(showTranslatedContent).then(() => {
      res.send('success');
    }).catch((error) => {
      next(error);
    });

  }).catch((error) => {
    next(error);
  });
});

router.post('/get-user-list', function(req, res, next) {
  const { body } = req;
  const { userUid, learningLanguage, spokenLanguage } = body;
  admin.database().ref(`/users`).once('value').then(snapshot => {
    const users = snapshot.val();
    const userList = [];
    Object.keys(users).forEach((key) => {
      const user = users[key];
      const otherUserAccountSettings = user.accountSettings;
      if(key !== userUid && learningLanguage === otherUserAccountSettings.spokenLanguage || (learningLanguage === 'none' && spokenLanguage === otherUserAccountSettings.learningLanguage)){
        userList.push(user.accountSettings);
      }
    });
    res.send(userList);
  }).catch((error) => {
    next(error);
  });
});

router.post('/update-images', function(req, res, next) {
  const { body } = req;
  const { userUid, images } = body;

  if(userUid !== undefined){
    admin.database().ref(`/users/${userUid}/accountSettings/images`).set(images).then(() => {
      res.send('success');
    }).catch((error) => {
      next(error);
    });
  }
});

router.post('/next-chat', function(req, res, next) {
  const { body } = req;
  const { userUid, otherUserUid } = body;
  admin.database().ref(`/users/${userUid}/lastUserUid`).set(otherUserUid).then(() => {
    res.send('done')
  }).catch(() => {
    res.send('error')
  });
});

router.post('/find-chat', function(req, res, next) {
  const { body } = req;
  const { userUid } = body;
  
  admin.database().ref(`/users/${userUid}`).once('value').then(snapshot => {
    const user = snapshot.val();
    const { chatList, accountSettings } = user;
    const { learningLanguage, spokenLanguage } = accountSettings;
    const dontMatchUserUidArr = [];

    dontMatchUserUidArr.push(userUid);

    if(chatList){
      for(let i = 0; i < chatList.length; i++){
        const chat = chatList[i];
        if(chat){
          const userUid = chat.otherUsersSettings.userUid;
          dontMatchUserUidArr.push(userUid);
        }
      }
    }

    admin.database().ref(`/users/`).once('value').then(snapshot => {
      const users = snapshot.val();
      const userList = [];
      let newCounter = 0;

      Object.keys(users).forEach((key) => {
        const user = users[key];
        const otherUsersSettings = user.accountSettings;
        if(!dontMatchUserUidArr.includes(key) && learningLanguage === otherUsersSettings.spokenLanguage){
          userList.push(otherUsersSettings);
          // newCounter++;
        }
      });

      userList.sort((a, b) => {
        let aObj = a.lastLogin;
        let bObj = b.lastLogin;

        aObj = parseInt(aObj, 10);
        if(isNaN(aObj)){
          aObj = 9999999999;
        }

        bObj = parseInt(bObj, 10);
        if(isNaN(bObj)){
          bObj = 9999999999;
        }

        const dateA = new Date(aObj * 1000);
        const dateB = new Date(bObj * 1000);

        if(a.status){
          return -1;
        }
        else if(dateA - dateB) {
          return 1;
        }

        return 0;

      });

      res.send(userList);

    }).catch((error) => {
      next(error);
    });

  }).catch((error) => {
    next(error);
  });
});

AWS.config.update({region: 'us-east-2'});
s3 = new AWS.S3({
  apiVersion: '2006-03-01',
  signatureVersion: 'v4'
});
const myBucket = 'elasticbeanstalk-us-east-2-303195835444';

router.post('/presigned-url', function(req, res, next) {
  const { body } = req;
  const { name } = body;

  s3.getSignedUrl('putObject', {
    Bucket: myBucket,
    Key: name
  }, (err, url) => {
    if(err){
      console.log(err)
      res.send(null)
    }
    else {
      res.send(url)
    }
  });
});

router.get('/get-application-version', function(req, res, next) {
  res.send('2.0');
});

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min)) + min; //The maximum is exclusive and the minimum is inclusive
}

//for my google sheets use case
router.post('/send-email', function(req, res, next) {
  const { body } = req;
  const { message, emailAddresses } = body;

  let transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: 'hello@projectatlas.world', 
      pass: 'atlapass_101' 
    }
  });

  const mailOptions = {
    to: emailAddresses,
    from: 'yash@everysay.ca',
    subject: "BTC %",
    text: message
  };

  transporter.sendMail(mailOptions).then(response => {
    const success = "Email to User sucessfully sent";
    res.send(success);
  }).catch(error => {
    res.send('error');
  });
});

module.exports = router;