/** node modules ***/
var request = require('request');
var atob = require("atob");
var mustache = require("mustache");

/*** config ***/
var config = require('./config');

/*** global variables ***/
var templateNames = null;

/*** main function ***/
exports.main = function(event, context) {
	if (event && event.Records && event.Records[0] && event.Records[0].kinesis) {
		event = JSON.parse(atob(event.Records[0].kinesis.data));
	} else {
		context.fail("event not as expected");
	}

    getTemplateNames(createGithubRequestObject(), function(tempNames) {
        templateNames = tempNames;

	    if (event.eventType.indexOf("created-order-with-transactional-customer") !== -1) {
	    	createOrderWithTransactionalCustomer(event, context);
	    } else if (event.eventType.indexOf("created-order-for-existing-customer") !== -1) {
	    	createOrderForExistingCustomer(event, context);
	    } else {
	    	context.succeed("does not handle event " + event.eventType);
	    }
    });
}

/*** process order confirmation emails ***/
function createOrderWithTransactionalCustomer(event, context) {
    //filter by email template
    var orderConfirmationTemplates = filterByEmailTemplate("welcomecustomer");

    //filter by country
    var orderConfirmationLanguageTemplates = filterByCountry(orderConfirmationTemplates, event.eventDetails.market);
    if (orderConfirmationLanguageTemplates.length < 1) {
    	context.succeed("Country template not found: " + event.eventDetails.market);
    }

    //filter by language
    var theChosenOne = orderConfirmationLanguageTemplates[0];

    //get template
    getTemplateFile(createGithubRequestObject(theChosenOne.name), function(templateFile) {
        var templateFileContent = JSON.parse(atob(templateFile.content));

        templateFileContent.Body = mustache.render(templateFileContent.Body, {
            "order": event.eventDetails
        }); //insert variables into email template

        console.log(event.eventDetails);

        var requestOptions = {
            url: "https://api.mailgun.net/v3/rs85123.mailgun.org/messages",
            headers: {
                Authorization: "Basic " + config.mailGunBase64APIKey
            },
            form: {
                from: templateFileContent.From,
                to: event.eventDetails.shipToEmail,
                subject: templateFileContent.Subject,
                text: templateFileContent.Body
            }
        };

        sendEmail(requestOptions, context);
    });

}


/*** process welcome customer emails ***/
function createOrderForExistingCustomer(event, context) {
	//filter by email template
    var orderConfirmationTemplates = filterByEmailTemplate("orderconfirmation");

    //filter by country
    var orderConfirmationLanguageTemplates = filterByCountry(orderConfirmationTemplates, event.eventDetails.market);
    if (orderConfirmationLanguageTemplates.length < 1) {
    	context.succeed("Country template not found: " + event.eventDetails.market);
    }

    //filter by language
    var theChosenOne = orderConfirmationLanguageTemplates[0];

    //get template
    getTemplateFile(createGithubRequestObject(theChosenOne.name), function(templateFile) {
        var templateFileContent = JSON.parse(atob(templateFile.content));

        templateFileContent.Body = mustache.render(templateFileContent.Body, {
            "order": event.eventDetails
        }); //insert variables into email template

        console.log(event.eventDetails);

        var requestOptions = {
            url: config.mailGunServerUrl + "/messages",
            headers: {
                Authorization: "Basic " + config.mailGunBase64APIKey
            },
            form: {
                from: templateFileContent.From,
                to: event.eventDetails.shipToEmail,
                subject: templateFileContent.Subject,
                text: templateFileContent.Body
            }
        };
        
        sendEmail(requestOptions, context);
    });
}


/*** supporting functions ***/
function filterByEmailTemplate(emailTemplateName) {
	return templateNames.filter(function(tn) {
        return tn.name.toLowerCase().indexOf(emailTemplateName.toLowerCase()) !== -1;
    });
};

function filterByCountry(emailTemplates, country) {
	return emailTemplates.filter(function(emailTemp) {
        var templateCountry = emailTemp.name.split("-")[1];
        if (templateCountry) {
            return templateCountry.toLowerCase().indexOf(country.toLowerCase()) !== -1;
        } else {
            return false;
        }
    });
}


function getTemplateFile(requestOptions, callback) {
    request(requestOptions, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            body = JSON.parse(body);
            callback(body);
        }
    });
}

/*
	returns request options to retrive specific template file
	If <file> isn't pass, returns request options to retrive directory of template files
*/
function createGithubRequestObject(file) {
	var requestOptions = {
        url: config.githubRepo,
        headers: {
            "User-Agent": "request", //required. http://developer.github.com/v3/#user-agent-required
            "Authorization": "token " + config.githubToken
        }
    };
    if (file) {
    	requestOptions.url += "/" + file;
    }
    return requestOptions;
}

function getTemplateNames(requestOptions, callback) {
	//TODO: save templateNames in variable and return if not falsy
    request(requestOptions, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            body = JSON.parse(body);
            callback(body);
        }
    });
}

function sendEmail(requestOptions, context) {
	console.log(requestOptions);
	request.post(requestOptions, function(error, response, body) {
        if (!error && response.statusCode == 200) {
        	context.succeed("sent!");
        } else {
        	context.fail("not sent! " + error + " " + JSON.stringify(response));
        }
    });
}

/*** local development ***/

/* Kinesis sample event - data is url encoded with email address of eric.ethington@unicity.com and event type as transactional customer */
// var event = {
//   "Records": [
//     {
//       "eventID": "shardId-000000000000:49545115243490985018280067714973144582180062593244200961",
//       "eventVersion": "1.0",
//       "kinesis": {
//         "partitionKey": "partitionKey-3",
//         "data": "ew0KICAgICJldmVudFR5cGUiOiAiaHR0cHM6Ly9oeWRyYS51bmljaXR5Lm5ldC92NS10ZXN0OmNyZWF0ZWQtb3JkZXItd2l0aC10cmFuc2FjdGlvbmFsLWN1c3RvbWVyIiwNCiAgICAiZXZlbnREZXRhaWxzIjogew0KICAgICAgICAibWFya2V0IjogIklUIiwNCiAgICAgICAgImxpbmVzIjogew0KICAgICAgICAgICAgIml0ZW1zIjogWw0KICAgICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAgICAgInF1YW50aXR5IjogMSwNCiAgICAgICAgICAgICAgICAgICAgIml0ZW0iOiB7DQogICAgICAgICAgICAgICAgICAgICAgICAiaWQiOiB7DQogICAgICAgICAgICAgICAgICAgICAgICAgICAgInVuaWNpdHkiOiAiMjcxNTYiDQogICAgICAgICAgICAgICAgICAgICAgICB9DQogICAgICAgICAgICAgICAgICAgIH0NCiAgICAgICAgICAgICAgICB9DQogICAgICAgICAgICBdDQogICAgICAgIH0sDQogICAgICAgICJzaGlwVG9BZGRyZXNzIjogew0KICAgICAgICAgICAgImNvdW50cnkiOiAiSVQiLA0KICAgICAgICAgICAgInN0YXRlIjogIiIsDQogICAgICAgICAgICAiY2l0eSI6ICJCZXJsaW4iLA0KICAgICAgICAgICAgInppcCI6ICIxMDExNyIsDQogICAgICAgICAgICAiYWRkcmVzczEiOiAiUm90ZW5hcm1lZXN0cmFzc2UgMSIsDQogICAgICAgICAgICAiYWRkcmVzczIiOiAiIg0KICAgICAgICB9LA0KICAgICAgICAic2hpcFRvTmFtZSI6IHsNCiAgICAgICAgICAgICJmaXJzdE5hbWUiOiAiRmlyc3QiLA0KICAgICAgICAgICAgImxhc3ROYW1lIjogIkxhc3QiDQogICAgICAgIH0sDQogICAgICAgICJzaGlwVG9FbWFpbCI6ICJlcmljLmV0aGluZ3RvbkB1bmljaXR5LmNvbSIsDQogICAgICAgICJzaGlwVG9QaG9uZSI6ICI1NTUtNTU1LTU1NTUiLA0KICAgICAgICAibm90ZXMiOiAicGxlYXNlIGdpdmUgbWUgZnJlZSBzaGFrZXIgY3VwIiwNCiAgICAgICAgInRyYW5zYWN0aW9ucyI6IHsNCiAgICAgICAgICAgICJpdGVtcyI6IG51bGwNCiAgICAgICAgfSwNCiAgICAgICAgInNoaXBwaW5nTWV0aG9kIjogew0KICAgICAgICAgICAgInR5cGUiOiAiRWNvbm9teSIsDQogICAgICAgICAgICAibG9jYXRpb24iOiAiIg0KICAgICAgICB9LA0KICAgICAgICAiZGF0ZUNyZWF0ZWQiOiAiMjAxNS0wNy0yMFQxNDowNTo0MS0wNjowMCIsDQogICAgICAgICJjdXN0b21lciI6IHsNCiAgICAgICAgICAgICJtYWluQWRkcmVzcyI6IHsNCiAgICAgICAgICAgICAgICAiY2l0eSI6ICJCZXJsaW4iLA0KICAgICAgICAgICAgICAgICJjb3VudHJ5IjogIklUIiwNCiAgICAgICAgICAgICAgICAic3RhdGUiOiAiIiwNCiAgICAgICAgICAgICAgICAiemlwIjogIjEwMTE3IiwNCiAgICAgICAgICAgICAgICAiYWRkcmVzczEiOiAiUm90ZW5hcm1lZXN0cmFzc2UgMSIsDQogICAgICAgICAgICAgICAgImFkZHJlc3MyIjogIiINCiAgICAgICAgICAgIH0sDQogICAgICAgICAgICAiaHVtYW5OYW1lIjogew0KICAgICAgICAgICAgICAgICJmaXJzdE5hbWUiOiAiRmlyc3QiLA0KICAgICAgICAgICAgICAgICJsYXN0TmFtZSI6ICJMYXN0Ig0KICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICJlbnJvbGxlciI6IHsNCiAgICAgICAgICAgICAgICAiaWQiOiB7DQogICAgICAgICAgICAgICAgICAgICJ1bmljaXR5IjogNTQ0NDQwMQ0KICAgICAgICAgICAgICAgIH0NCiAgICAgICAgICAgIH0sDQogICAgICAgICAgICAic3BvbnNvciI6IHsNCiAgICAgICAgICAgICAgICAiaWQiOiB7DQogICAgICAgICAgICAgICAgICAgICJ1bmljaXR5IjogMg0KICAgICAgICAgICAgICAgIH0NCiAgICAgICAgICAgIH0sDQogICAgICAgICAgICAiZW1haWwiOiAiZXJpYy5ldGhpbmd0b25AdW5pY2l0eS5jb20iLA0KICAgICAgICAgICAgInR5cGUiOiAiQ3VzdG9tZXIiLA0KICAgICAgICAgICAgInN0YXR1cyI6ICJBY3RpdmUiLA0KICAgICAgICAgICAgImlkIjogew0KICAgICAgICAgICAgICAgICJ1bmljaXR5IjogIjEwMzcwNDE0OSINCiAgICAgICAgICAgIH0NCiAgICAgICAgfSwNCiAgICAgICAgImlkIjogew0KICAgICAgICAgICAgInVuaWNpdHkiOiAiNDktODk5NzY1MyINCiAgICAgICAgfSwNCiAgICAgICAgInRlcm1zIjogew0KICAgICAgICAgICAgInRvdGFsIjogIjMxLjQ0IiwNCiAgICAgICAgICAgICJzdWJ0b3RhbCI6ICIxOC42IiwNCiAgICAgICAgICAgICJ0YXgiOiB7DQogICAgICAgICAgICAgICAgImFtb3VudCI6ICIzLjg0Ig0KICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICJmcmVpZ2h0Ijogew0KICAgICAgICAgICAgICAgICJhbW91bnQiOiAiOSINCiAgICAgICAgICAgIH0sDQogICAgICAgICAgICAiZGlzY291bnQiOiB7DQogICAgICAgICAgICAgICAgImFtb3VudCI6ICIwIg0KICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICJwdiI6ICIxMCINCiAgICAgICAgfQ0KICAgIH0NCn0",
//         "kinesisSchemaVersion": "1.0",
//         "sequenceNumber": "49545115243490985018280067714973144582180062593244200961"
//       },
//       "invokeIdentityArn": "arn:aws:iam::EXAMPLE",
//       "eventName": "aws:kinesis:record",
//       "eventSourceARN": "arn:aws:kinesis:EXAMPLE",
//       "eventSource": "aws:kinesis",
//       "awsRegion": "us-east-1"
//     }
//   ]
// };

/* Kinesis sample event - data is url encoded with email address of eric.ethington@unicity.com and event type as existing customer */
// var event = {
//   "Records": [
//     {
//       "eventID": "shardId-000000000000:49545115243490985018280067714973144582180062593244200961",
//       "eventVersion": "1.0",
//       "kinesis": {
//         "partitionKey": "partitionKey-3",
//         "data": "ew0KICAgICJldmVudFR5cGUiOiAiaHR0cHM6Ly9oeWRyYS51bmljaXR5Lm5ldC92NS10ZXN0OmNyZWF0ZWQtb3JkZXItZm9yLWV4aXN0aW5nLWN1c3RvbWVyIiwNCiAgICAiZXZlbnREZXRhaWxzIjogew0KICAgICAgICAibWFya2V0IjogIklUIiwNCiAgICAgICAgImxpbmVzIjogew0KICAgICAgICAgICAgIml0ZW1zIjogWw0KICAgICAgICAgICAgICAgIHsNCiAgICAgICAgICAgICAgICAgICAgInF1YW50aXR5IjogMSwNCiAgICAgICAgICAgICAgICAgICAgIml0ZW0iOiB7DQogICAgICAgICAgICAgICAgICAgICAgICAiaWQiOiB7DQogICAgICAgICAgICAgICAgICAgICAgICAgICAgInVuaWNpdHkiOiAiMjcxNTYiDQogICAgICAgICAgICAgICAgICAgICAgICB9DQogICAgICAgICAgICAgICAgICAgIH0NCiAgICAgICAgICAgICAgICB9DQogICAgICAgICAgICBdDQogICAgICAgIH0sDQogICAgICAgICJzaGlwVG9BZGRyZXNzIjogew0KICAgICAgICAgICAgImNvdW50cnkiOiAiSVQiLA0KICAgICAgICAgICAgInN0YXRlIjogIiIsDQogICAgICAgICAgICAiY2l0eSI6ICJCZXJsaW4iLA0KICAgICAgICAgICAgInppcCI6ICIxMDExNyIsDQogICAgICAgICAgICAiYWRkcmVzczEiOiAiUm90ZW5hcm1lZXN0cmFzc2UgMSIsDQogICAgICAgICAgICAiYWRkcmVzczIiOiAiIg0KICAgICAgICB9LA0KICAgICAgICAic2hpcFRvTmFtZSI6IHsNCiAgICAgICAgICAgICJmaXJzdE5hbWUiOiAiRmlyc3QiLA0KICAgICAgICAgICAgImxhc3ROYW1lIjogIkxhc3QiDQogICAgICAgIH0sDQogICAgICAgICJzaGlwVG9FbWFpbCI6ICJlcmljLmV0aGluZ3RvbkB1bmljaXR5LmNvbSIsDQogICAgICAgICJzaGlwVG9QaG9uZSI6ICI1NTUtNTU1LTU1NTUiLA0KICAgICAgICAibm90ZXMiOiAicGxlYXNlIGdpdmUgbWUgZnJlZSBzaGFrZXIgY3VwIiwNCiAgICAgICAgInRyYW5zYWN0aW9ucyI6IHsNCiAgICAgICAgICAgICJpdGVtcyI6IG51bGwNCiAgICAgICAgfSwNCiAgICAgICAgInNoaXBwaW5nTWV0aG9kIjogew0KICAgICAgICAgICAgInR5cGUiOiAiRWNvbm9teSIsDQogICAgICAgICAgICAibG9jYXRpb24iOiAiIg0KICAgICAgICB9LA0KICAgICAgICAiZGF0ZUNyZWF0ZWQiOiAiMjAxNS0wNy0yMFQxNDowNTo0MS0wNjowMCIsDQogICAgICAgICJjdXN0b21lciI6IHsNCiAgICAgICAgICAgICJtYWluQWRkcmVzcyI6IHsNCiAgICAgICAgICAgICAgICAiY2l0eSI6ICJCZXJsaW4iLA0KICAgICAgICAgICAgICAgICJjb3VudHJ5IjogIklUIiwNCiAgICAgICAgICAgICAgICAic3RhdGUiOiAiIiwNCiAgICAgICAgICAgICAgICAiemlwIjogIjEwMTE3IiwNCiAgICAgICAgICAgICAgICAiYWRkcmVzczEiOiAiUm90ZW5hcm1lZXN0cmFzc2UgMSIsDQogICAgICAgICAgICAgICAgImFkZHJlc3MyIjogIiINCiAgICAgICAgICAgIH0sDQogICAgICAgICAgICAiaHVtYW5OYW1lIjogew0KICAgICAgICAgICAgICAgICJmaXJzdE5hbWUiOiAiRmlyc3QiLA0KICAgICAgICAgICAgICAgICJsYXN0TmFtZSI6ICJMYXN0Ig0KICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICJlbnJvbGxlciI6IHsNCiAgICAgICAgICAgICAgICAiaWQiOiB7DQogICAgICAgICAgICAgICAgICAgICJ1bmljaXR5IjogNTQ0NDQwMQ0KICAgICAgICAgICAgICAgIH0NCiAgICAgICAgICAgIH0sDQogICAgICAgICAgICAic3BvbnNvciI6IHsNCiAgICAgICAgICAgICAgICAiaWQiOiB7DQogICAgICAgICAgICAgICAgICAgICJ1bmljaXR5IjogMg0KICAgICAgICAgICAgICAgIH0NCiAgICAgICAgICAgIH0sDQogICAgICAgICAgICAiZW1haWwiOiAiZXJpYy5ldGhpbmd0b25AdW5pY2l0eS5jb20iLA0KICAgICAgICAgICAgInR5cGUiOiAiQ3VzdG9tZXIiLA0KICAgICAgICAgICAgInN0YXR1cyI6ICJBY3RpdmUiLA0KICAgICAgICAgICAgImlkIjogew0KICAgICAgICAgICAgICAgICJ1bmljaXR5IjogIjEwMzcwNDE0OSINCiAgICAgICAgICAgIH0NCiAgICAgICAgfSwNCiAgICAgICAgImlkIjogew0KICAgICAgICAgICAgInVuaWNpdHkiOiAiNDktODk5NzY1MyINCiAgICAgICAgfSwNCiAgICAgICAgInRlcm1zIjogew0KICAgICAgICAgICAgInRvdGFsIjogIjMxLjQ0IiwNCiAgICAgICAgICAgICJzdWJ0b3RhbCI6ICIxOC42IiwNCiAgICAgICAgICAgICJ0YXgiOiB7DQogICAgICAgICAgICAgICAgImFtb3VudCI6ICIzLjg0Ig0KICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICJmcmVpZ2h0Ijogew0KICAgICAgICAgICAgICAgICJhbW91bnQiOiAiOSINCiAgICAgICAgICAgIH0sDQogICAgICAgICAgICAiZGlzY291bnQiOiB7DQogICAgICAgICAgICAgICAgImFtb3VudCI6ICIwIg0KICAgICAgICAgICAgfSwNCiAgICAgICAgICAgICJwdiI6ICIxMCINCiAgICAgICAgfQ0KICAgIH0NCn0",
//         "kinesisSchemaVersion": "1.0",
//         "sequenceNumber": "49545115243490985018280067714973144582180062593244200961"
//       },
//       "invokeIdentityArn": "arn:aws:iam::EXAMPLE",
//       "eventName": "aws:kinesis:record",
//       "eventSourceARN": "arn:aws:kinesis:EXAMPLE",
//       "eventSource": "aws:kinesis",
//       "awsRegion": "us-east-1"
//     }
//   ]
// };

// var context = {
//     succeed: function(string) {
//         console.log(string);
//     },
//     fail: function(string) {
//         console.log(string);
//     },
//	   done: function() {console.log("done!");}
// };
//exports.main(event, context);

/*** end of local development ***/