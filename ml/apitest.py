import urllib.request
import json

# Request data goes here
# The example below assumes JSON formatting which may be updated
# depending on the format your endpoint expects.
# More information can be found here:
# https://docs.microsoft.com/azure/machine-learning/how-to-deploy-advanced-entry-script
data = {

    "city": "chicago",

    "historical_data": {

      "hourly__time": [

        "2024-10-04T00:00:00",

        "2024-10-04T01:00:00",

        "2024-10-04T02:00:00",

        "2024-10-04T03:00:00",

        "2024-10-04T04:00:00",

        "2024-10-04T05:00:00",

        "2024-10-04T06:00:00",

        "2024-10-04T07:00:00",

        "2024-10-04T08:00:00",

        "2024-10-04T09:00:00",

        "2024-10-04T10:00:00",

        "2024-10-04T11:00:00",

        "2024-10-04T12:00:00",

        "2024-10-04T13:00:00",

        "2024-10-04T14:00:00",

        "2024-10-04T15:00:00",

        "2024-10-04T16:00:00",

        "2024-10-04T17:00:00",

        "2024-10-04T18:00:00",

        "2024-10-04T19:00:00",

        "2024-10-04T20:00:00",

        "2024-10-04T21:00:00",

        "2024-10-04T22:00:00",

        "2024-10-04T23:00:00",

        "2024-10-05T00:00:00"

      ],

      "hourly__pm2_5": [

        25.5, 26.1, 24.8, 23.5, 22.9, 

        21.7, 20.5, 22.3, 28.4, 32.1, 

        35.6, 38.2, 39.5, 40.1, 39.8, 

        38.5, 36.9, 35.2, 33.8, 31.5, 

        29.3, 27.8, 26.4, 25.9, 25.2

      ],

      "hourly__pm10": [

        40.2, 41.0, 39.5, 38.1, 37.3, 

        35.8, 34.2, 36.5, 44.8, 51.3, 

        56.9, 60.8, 63.2, 64.5, 63.9, 

        61.7, 58.6, 55.4, 52.8, 49.5, 

        46.3, 43.9, 41.8, 40.9, 39.8

      ],

      "hourly__carbon_dioxide": [

        410.5, 411.0, 411.2, 411.5, 411.8, 

        412.0, 412.3, 412.5, 412.8, 413.0, 

        413.3, 413.5, 413.8, 414.0, 414.2, 

        414.5, 414.7, 415.0, 415.2, 415.5, 

        415.7, 416.0, 416.2, 416.5, 416.8

      ],

      "hourly__sulphur_dioxide": [

        5.1, 5.3, 5.0, 4.8, 4.6, 

        4.4, 4.2, 4.5, 5.8, 6.7, 

        7.4, 8.0, 8.3, 8.6, 8.4, 

        8.1, 7.6, 7.2, 6.8, 6.3, 

        5.9, 5.6, 5.3, 5.2, 5.1

      ]

    }

  }

body = str.encode(json.dumps(data))

url = 'https://aqi-prediction-sglxs.eastus2.inference.ml.azure.com/score'
# Replace this with the primary/secondary key, AMLToken, or Microsoft Entra ID token for the endpoint
api_key = 'KEY_HERE'
if not api_key:
    raise Exception("A key should be provided to invoke the endpoint")


headers = {'Content-Type':'application/json', 'Accept': 'application/json', 'Authorization':('Bearer '+ api_key)}

req = urllib.request.Request(url, body, headers)

try:
    response = urllib.request.urlopen(req)

    result = response.read()
    print(result)
except urllib.error.HTTPError as error:
    print("The request failed with status code: " + str(error.code))

    # Print the headers - they include the requert ID and the timestamp, which are useful for debugging the failure
    print(error.info())
    print(error.read().decode("utf8", 'ignore'))
