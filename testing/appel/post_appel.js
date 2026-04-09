fetch("https://apip.ecoledirecte.com/v3/classes/142/appel/horaires/11:00-15:00.awp?verbe=post&v=4.97.2", {
  method: "POST",
  headers: {
    "accept": "application/json, text/plain, */*",
    "accept-language": "fr-FR,fr;q=0.9",
    "content-type": "application/x-www-form-urlencoded",
    "x-token": "3db6a91b-c4a0-4d2e-af9b-3fd970cacdc6",
    "Referer": "https://www.ecoledirecte.com/"
  },
  body: new URLSearchParams({
    data: JSON.stringify({
      eleves: [
        { id: 3151, isAbsent: true },
        { id: 3152, isAbsent: true },
        { id: 3153, isAbsent: false },
        { id: 3154, isAbsent: true },
        { id: 3155, isAbsent: true }
      ]
    })
  })
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