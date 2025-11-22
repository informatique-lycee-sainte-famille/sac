fetch("https://apip.ecoledirecte.com/v3/classes/142/appel/horaires/13:00-23:59.awp?verbe=get&v=4.89.3", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "fr-FR,fr;q=0.9",
    "content-type": "application/x-www-form-urlencoded",
    "priority": "u=1, i",
    "sec-ch-ua": "\"Chromium\";v=\"142\", \"Brave\";v=\"142\", \"Not_A Brand\";v=\"99\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "sec-gpc": "1",
    "x-token": "5f5955ab-6be9-4598-a9da-9ba40cd3b106",
    "Referer": "https://www.ecoledirecte.com/"
  },
  "body": "data={\n    \"date\": \"\"\n}",
  "method": "POST"
});

response :
{
    "code": 200,
    "data": {
        "idsAbsent": [
            3151,
            3153,
            3155
        ],
        "eleves": [
            {
                "particule": "",
                "nom": "ZZZ TEST 01",
                "prenom": "A",
                "sexe": "M",
                "id": 3151,
                "photo": ""
            },
            {
                "particule": "",
                "nom": "ZZZ TEST 02",
                "prenom": "B",
                "sexe": "F",
                "id": 3152,
                "photo": ""
            },
            {
                "particule": "",
                "nom": "ZZZ TEST 03",
                "prenom": "C",
                "sexe": "M",
                "id": 3153,
                "photo": ""
            },
            {
                "particule": "",
                "nom": "ZZZ TEST 04",
                "prenom": "D",
                "sexe": "F",
                "id": 3154,
                "photo": ""
            },
            {
                "particule": "",
                "nom": "ZZZ TEST 05",
                "prenom": "E",
                "sexe": "M",
                "id": 3155,
                "photo": ""
            }
        ]
    },
    "message": null,
    "host": "HTTP50"
}