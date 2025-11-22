fetch("https://apip.ecoledirecte.com/v3/salles/115/appel/horaires.awp?verbe=get&v=4.89.3", {
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
  "body": "data={}",
  "method": "POST"
});

response : 
{
    "code": 200,
    "token": "5f5955ab-6be9-4598-a9da-9ba40cd3b106",
    "host": "HTTP88",
    "data": [
        {
            "id": 156706,
            "text": "U4-Et. Syst.Num. et d'Info",
            "matiere": "U4-Et. Syst.Num. et d'Info",
            "codeMatiere": "U4SN",
            "typeCours": "COURS",
            "start_date": "2025-11-21 13:00",
            "end_date": "2025-11-21 23:59",
            "color": "#91b2bc",
            "dispensable": false,
            "dispense": 0,
            "prof": "SAINTONGE  A.",
            "salle": "TEST",
            "classe": "S.A.C. TEST (Téo LORMONT Projet)",
            "classeId": 142,
            "classeCode": "SAC-TEST",
            "evenementId": 0,
            "groupe": "",
            "groupeCode": "",
            "isFlexible": false,
            "groupeId": 0,
            "icone": "",
            "isModifie": false,
            "contenuDeSeance": false,
            "devoirAFaire": false,
            "isAnnule": false
        }
    ]
}