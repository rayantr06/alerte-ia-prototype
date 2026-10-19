# Alerte IA — Appui au traitement des appels de protection civile

Alerte IA est un prototype réalisé autour des appels reçus par la protection civile de Béjaïa. Il explore une chaîne allant de l'audio multilingue à une fiche structurée, avec une validation humaine. Cette étude de cas présente les choix, les difficultés et les limites du projet, au-delà de son démonstrateur final.

Le travail couvre la préparation des données, la transcription, l'extraction d'informations et une interface d'aide à l'opérateur. Il ne constitue ni un système opérationnel de prise de décision ni une preuve de déploiement autonome sur les postes du service.

## Partir d'un besoin de terrain

L'équipe souhaitait travailler sur le traitement du langage et de petits modèles potentiellement déployables localement, avec un problème délimité et une utilité concrète. Le terrain a donné une direction : les appels sont enregistrés, tandis que les interventions alimentent des fiches quotidiennes destinées au ministère. Le projet explore comment relier ces deux supports sans confondre extraction automatique et information vérifiée.

Le stage a aussi changé le plan de collecte. Les archives audio anciennes étaient inaccessibles en pratique : matériel défaillant, format propriétaire et difficultés d'accès. L'équipe a acheté un enregistreur et constitué une nouvelle collecte. Le travail a donc avancé comme une preuve de concept à données limitées, plutôt qu'à partir d'un historique immédiatement exploitable.

## Mon rôle et le travail collectif

J'ai pris en charge les décisions techniques d'outillage et d'intégration. Ma méthode part des besoins utilisateur, traduits en user stories, puis en PRD ou spécifications, tâches et critères d'acceptation. Selon le problème, je demande aux agents de commencer par des tests censés échouer avant l'implémentation, en précisant les comportements attendus.

J'utilise des agents pour rechercher des approches et produire du code. Je choisis les méthodes retenues et vérifie leur intégration, la logique, les cas d'erreur et le comportement par des contrôles manuels. Une sortie plausible ou un test réussi ne suffit pas à valider une solution.

Deux data scientists ont assuré la validation et la correction manuelle des annotations. Leur travail a également couvert la revue des explications générées pour l'entraînement. Un benchmark distinct, annoté manuellement, a été préparé avant les expérimentations. Le projet repose sur ce travail collectif, et pas uniquement sur l'assemblage de modèles.

## Travailler avec la parole réelle

Les appels mêlent kabyle, darja et français. La parole est spontanée, rapide, parfois stressée, bruitée ou superposée. Les lieux peuvent être désignés par un repère local plutôt que par une adresse, avec des graphies variables. Les ressources adaptées à ce domaine et à ces usages linguistiques sont limitées.

La préparation des données est ainsi devenue un chantier central. Pour aligner texte et audio, nous avons combiné MMS et une détection d'activité vocale, ou VAD. Des échantillons manuellement vérifiés ont servi à calibrer l'interprétation des scores. Lorsque des mots disparaissaient aux frontières, nous avons travaillé sur la taille des segments et le déplacement de leurs limites.

Le score servait à orienter la vérification, puis l'écoute permettait de trancher. J'ai développé un outil de correction manuelle pour faciliter ce travail. Les segments irrécupérables étaient écartés plutôt que conservés avec une annotation artificiellement certaine.

## Vérifier ce que les agents optimisent

Certaines itérations ont révélé un piège : des agents amélioraient leurs prompts avec des mots ou exemples trop proches des tests. Une implémentation d'alignement était aussi adaptée en dur à un seul segment.

J'ai retiré les indices directs issus des tests et remplacé les ajustements ponctuels par des indications linguistiques générales, construites à partir d'exemples de développement corrigés. L'alignement a été repris pour dépasser le cas particulier.

Cette expérience a renforcé ma vigilance sur la différence entre réussir un exemple et résoudre le problème. L'évaluation finale s'appuie sur un benchmark séparé, tandis que les corrections et les contrôles manuels servent à améliorer les outils de préparation.

## Structurer l'information sans masquer l'incertitude

L'extraction produit un JSON strict, avec des valeurs autorisées et un validateur de code. Cela permet de contrôler la structure et certaines contraintes. Un JSON valide peut néanmoins contenir un lieu erroné ou une information mal interprétée : la conformité au schéma ne garantit pas la justesse métier.

Pour préparer l'entraînement d'un petit modèle, Gemini a reçu une transcription et sa fiche de référence afin de générer une explication. Les deux data scientists ont revu et corrigé ces contenus. Le petit modèle a ensuite été entraîné à produire une explication, puis le JSON. Gemini accélère ainsi la préparation, tandis que la validation des données reste humaine.

Nous avons aussi exploré des données synthétiques en kabyle. Les prompts associent des instructions fixes, des scénarios ciblant les manques du corpus — incident, langue, victimes, urgence, lieu — et la récupération d'appels similaires par RAG. L'objectif est d'équilibrer naturel et contrôle, sans revendiquer ici un gain quantifié.

## Ce qui a été construit, ce qui reste envisagé

Un répertoire géographique associe données cartographiques, repères locaux et zones. Le prototype affiche des groupes de lieux candidats et des endroits connus à proximité. L'opérateur reste chargé de clarifier la localisation. La génération automatique de questions de clarification est une piste, pas une fonctionnalité réalisée.

Le terrain a également révélé la gestion des appels mal dirigés : l'appelant note un numéro, raccroche et rappelle. L'équipe a étudié les équipements manquants, les prix et les services d'un fournisseur. Celui-ci a indiqué que l'infrastructure était disponible ; une proposition a été préparée. L'intégration du transfert d'appel n'a pas été implémentée.

Enfin, les PC de démonstration ne pouvaient pas exécuter Whisper et l'extracteur simultanément. Un worker sur une machine virtuelle universitaire exécutait les traitements et renvoyait les résultats aux interfaces des PC. Ce montage a permis la démonstration, en séparant l'interface du calcul et en tenant compte des ressources disponibles. Un déploiement entièrement sur site reste à dimensionner selon le matériel cible.

## Bilan et limites

Les résultats concrets sont une chaîne de préparation et de correction des données, des expérimentations d'alignement et d'extraction, un répertoire de lieux et un démonstrateur intégré. Aucun gain de temps de traitement ni amélioration de l'orientation des secours n'est établi ici.

Le prototype n'est pas prêt pour un usage critique en production. L'authentification, la confidentialité, la fiabilité, les tests et les performances nécessitent encore du travail. La suite doit articuler évaluation sur le benchmark et vérification métier : informations manquantes, erreurs de lieu et charge de correction pour l'opérateur. Cette présentation publique n'inclut ni appels bruts ni données personnelles.
