fetch("https://apip.ecoledirecte.com/v3/classes/142/appel/horaires/13:00-23:59.awp?verbe=post&v=4.89.3", {
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
  "body": "data={\n    \"eleves\": [\n        {\n            \"id\": 3151,\n            \"nom\": \"ZZZ TEST 01\",\n            \"prenom\": \"A\",\n            \"numeroBadge\": \"41510\",\n            \"particule\": \"\",\n            \"photo\": \"\",\n            \"classeId\": 142,\n            \"classeLibelle\": \"S.A.C. TEST (Téo LORMONT Projet)\",\n            \"regime\": \"Externe libre\",\n            \"dateNaissance\": \"2000-01-01\",\n            \"sexe\": \"M\",\n            \"absentAvant\": false,\n            \"coordinateursPeda\": [],\n            \"dateEntree\": \"2025-09-02\",\n            \"dateSortie\": \"\",\n            \"dispense\": false,\n            \"dispositifs\": [],\n            \"email\": \"a01.zzztest@lyceesaintefamille.com\",\n            \"estApprenant\": false,\n            \"estEnStage\": false,\n            \"isAbsent\": true,\n            \"portable\": \"06.00.00.00.01\",\n            \"presenceObligatoire\": true\n        },\n        {\n            \"id\": 3152,\n            \"nom\": \"ZZZ TEST 02\",\n            \"prenom\": \"B\",\n            \"numeroBadge\": \"41520\",\n            \"particule\": \"\",\n            \"photo\": \"\",\n            \"classeId\": 142,\n            \"classeLibelle\": \"S.A.C. TEST (Téo LORMONT Projet)\",\n            \"regime\": \"Externe libre\",\n            \"dateNaissance\": \"2000-01-01\",\n            \"sexe\": \"F\",\n            \"absentAvant\": false,\n            \"coordinateursPeda\": [],\n            \"dateEntree\": \"2025-09-02\",\n            \"dateSortie\": \"\",\n            \"dispense\": false,\n            \"dispositifs\": [],\n            \"email\": \"b02.zzztest@lyceesaintefamille.com\",\n            \"estApprenant\": false,\n            \"estEnStage\": false,\n            \"portable\": \"06.00.00.00.02\",\n            \"presenceObligatoire\": true\n        },\n        {\n            \"id\": 3153,\n            \"nom\": \"ZZZ TEST 03\",\n            \"prenom\": \"C\",\n            \"numeroBadge\": \"41530\",\n            \"particule\": \"\",\n            \"photo\": \"\",\n            \"classeId\": 142,\n            \"classeLibelle\": \"S.A.C. TEST (Téo LORMONT Projet)\",\n            \"regime\": \"Externe libre\",\n            \"dateNaissance\": \"2000-01-01\",\n            \"sexe\": \"M\",\n            \"absentAvant\": false,\n            \"coordinateursPeda\": [],\n            \"dateEntree\": \"2025-09-02\",\n            \"dateSortie\": \"\",\n            \"dispense\": false,\n            \"dispositifs\": [],\n            \"email\": \"c03.zzztest@lyceesaintefamille.com\",\n            \"estApprenant\": false,\n            \"estEnStage\": false,\n            \"isAbsent\": true,\n            \"portable\": \"06.00.00.00.03\",\n            \"presenceObligatoire\": true\n        },\n        {\n            \"id\": 3154,\n            \"nom\": \"ZZZ TEST 04\",\n            \"prenom\": \"D\",\n            \"numeroBadge\": \"41540\",\n            \"particule\": \"\",\n            \"photo\": \"\",\n            \"classeId\": 142,\n            \"classeLibelle\": \"S.A.C. TEST (Téo LORMONT Projet)\",\n            \"regime\": \"Externe libre\",\n            \"dateNaissance\": \"2000-01-01\",\n            \"sexe\": \"F\",\n            \"absentAvant\": false,\n            \"coordinateursPeda\": [],\n            \"dateEntree\": \"2025-09-02\",\n            \"dateSortie\": \"\",\n            \"dispense\": false,\n            \"dispositifs\": [],\n            \"email\": \"d04.zzztest@lyceesaintefamille.com\",\n            \"estApprenant\": false,\n            \"estEnStage\": false,\n            \"portable\": \"06.00.00.00.04\",\n            \"presenceObligatoire\": true\n        },\n        {\n            \"id\": 3155,\n            \"nom\": \"ZZZ TEST 05\",\n            \"prenom\": \"E\",\n            \"numeroBadge\": \"41550\",\n            \"particule\": \"\",\n            \"photo\": \"\",\n            \"classeId\": 142,\n            \"classeLibelle\": \"S.A.C. TEST (Téo LORMONT Projet)\",\n            \"regime\": \"Externe libre\",\n            \"dateNaissance\": \"2000-01-01\",\n            \"sexe\": \"M\",\n            \"absentAvant\": false,\n            \"coordinateursPeda\": [],\n            \"dateEntree\": \"2025-09-02\",\n            \"dateSortie\": \"\",\n            \"dispense\": false,\n            \"dispositifs\": [],\n            \"email\": \"e05.zzztest@lyceesaintefamille.com\",\n            \"estApprenant\": false,\n            \"estEnStage\": false,\n            \"portable\": \"06.00.00.00.05\",\n            \"presenceObligatoire\": true\n        }\n    ]\n}",
  "method": "POST"
});

response :
{
    "code": 200,
    "token": "5f5955ab-6be9-4598-a9da-9ba40cd3b106",
    "host": "HTTP47",
    "data": {
        "dateHeure": "2025-11-21 22:36:03"
    }
}