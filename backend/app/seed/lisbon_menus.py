"""Sample menus for the demo restaurants (the five made-up ones, the Lisbon and Porto catalogues and Casa Guedes).

Every menu has the same shape, so they read alike on the restaurant page: Starters, Mains, Desserts, Drinks.
The dishes are typical of each house and named the way the house names them; the descriptions are short and in English.
**The prices are indicative and made up for the demo**: nobody published them to this project, and the pages that do
(for example TheFork) are not copied. The public page says so for every demo restaurant.

    python -m app.seed.lisbon_menus                 a local SQLite demo database (DEMO_MODE=1)
    python -m app.seed.lisbon_menus --allow-remote  the shared demo database (Neon): only after a backup

Repeatable: a restaurant that already has a menu keeps it; only empty menus are filled.
"""

import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import db
from app.config import get_settings
from app.models import RestaurantMenu, Venue
from app.seed.porto_menus import PORTO_MENUS

Item = tuple[str, str, str, float, str]  # category, name, description, price in euros, allergens

S, M, D, B = "Starters", "Mains", "Desserts", "Drinks"

MENUS: dict[str, list[Item]] = {
    # ------------------------------------------------------------------ the five made-up restaurants
    "casa-lumen": [
        (
            S,
            "Sopa de legumes da horta",
            "Seasonal vegetable soup with olive oil and herbs.",
            5.5,
            "Celery",
        ),
        (
            S,
            "Tosta de queijo de cabra",
            "Goat cheese on toasted sourdough with honey and walnuts.",
            8.5,
            "Gluten, Milk, Nuts",
        ),
        (
            S,
            "Salada de polvo",
            "Octopus with chickpeas, red onion and coriander.",
            12.0,
            "Molluscs",
        ),
        (
            M,
            "Bacalhau com broa",
            "Baked cod with a cornbread crust and sautéed greens.",
            19.5,
            "Fish, Gluten",
        ),
        (
            M,
            "Arroz de pato",
            "Slow-cooked duck rice with chouriço, baked until crisp.",
            17.0,
            "Celery",
        ),
        (M, "Risotto de cogumelos", "Creamy mushroom risotto with parmesan.", 15.5, "Milk"),
        (M, "Bife de novilho", "Grilled beef with garlic butter and hand-cut chips.", 21.0, "Milk"),
        (D, "Pudim de ovos", "Classic Portuguese egg pudding with caramel.", 5.0, "Eggs, Milk"),
        (D, "Tarte de maçã", "Warm apple tart with vanilla ice cream.", 6.0, "Gluten, Eggs, Milk"),
        (B, "Vinho da casa (copo)", "Red, white or rosé, by the glass.", 4.0, "Sulphites"),
        (B, "Água / refrigerante", "Still or sparkling water, soft drinks.", 2.5, ""),
        (B, "Café", "Espresso.", 1.4, ""),
    ],
    "tagus-terrace": [
        (
            S,
            "Amêijoas à Bulhão Pato",
            "Clams in garlic, coriander and white wine.",
            14.0,
            "Molluscs, Sulphites",
        ),
        (S, "Gambas ao alho", "Sizzling prawns with garlic and chilli.", 15.5, "Crustaceans"),
        (S, "Pão com manteiga de ervas", "Warm bread with herb butter.", 3.5, "Gluten, Milk"),
        (
            M,
            "Arroz de marisco",
            "Soupy seafood rice with prawns, clams and crab.",
            26.0,
            "Crustaceans, Molluscs",
        ),
        (M, "Dourada grelhada", "Grilled sea bream with boiled potatoes and greens.", 22.0, "Fish"),
        (
            M,
            "Cataplana de peixe",
            "Fish and shellfish cooked with tomato and peppers, for two.",
            48.0,
            "Fish, Crustaceans, Molluscs",
        ),
        (M, "Lulas grelhadas", "Grilled squid with a lemon and garlic dressing.", 19.0, "Molluscs"),
        (D, "Mousse de chocolate", "Dark chocolate mousse with sea salt.", 5.5, "Eggs, Milk"),
        (D, "Gelado de limão", "Lemon sorbet served in the fruit.", 5.0, ""),
        (B, "Vinho verde (garrafa)", "Chilled Minho white wine.", 16.0, "Sulphites"),
        (B, "Sangria da casa (jarro)", "White or red, with fresh fruit.", 18.0, "Sulphites"),
        (B, "Imperial", "Draught beer, 20 cl.", 2.2, "Gluten"),
    ],
    "patio-das-laranjeiras": [
        (
            S,
            "Hummus com legumes",
            "Chickpea hummus with roasted vegetables and warm flatbread.",
            7.5,
            "Sesame, Gluten",
        ),
        (
            S,
            "Bruschetta de tomate",
            "Ripe tomato, basil and olive oil on grilled bread.",
            6.5,
            "Gluten",
        ),
        (
            S,
            "Salada de laranja e funcho",
            "Orange, fennel and olives with a citrus dressing.",
            8.0,
            "",
        ),
        (
            M,
            "Lasanha de legumes",
            "Layers of courgette, aubergine and ricotta.",
            14.5,
            "Gluten, Milk, Eggs",
        ),
        (M, "Curry de grão", "Chickpea curry with coconut milk and rice.", 13.5, "Mustard"),
        (
            M,
            "Cuscuz com legumes assados",
            "Couscous with roasted vegetables, almonds and mint.",
            13.0,
            "Gluten, Nuts",
        ),
        (
            M,
            "Pizza de figos e queijo",
            "Figs, goat cheese and rocket on a thin base.",
            14.0,
            "Gluten, Milk",
        ),
        (D, "Bolo de laranja", "Moist orange cake with whipped cream.", 5.5, "Gluten, Eggs, Milk"),
        (D, "Salada de frutas", "Seasonal fruit with mint.", 4.5, ""),
        (B, "Sumo de laranja natural", "Freshly squeezed from the patio's trees.", 3.5, ""),
        (B, "Limonada de hortelã", "Homemade lemonade with mint.", 3.5, ""),
        (B, "Chá de ervas", "A pot of herbal tea.", 2.8, ""),
    ],
    "miradouro-7": [
        (
            S,
            "Pica-pau de atum",
            "Diced tuna in a spiced sauce with pickles.",
            12.5,
            "Fish, Mustard",
        ),
        (
            S,
            "Croquetes de leitão",
            "Roast suckling pig croquettes with mustard cream.",
            11.0,
            "Gluten, Milk, Mustard",
        ),
        (
            S,
            "Tártaro de salmão e abacate",
            "Salmon and avocado tartare with soy and lime.",
            14.0,
            "Fish, Soy",
        ),
        (
            M,
            "Bacalhau confitado",
            "Slow-cooked cod with sweet potato purée and olive crumb.",
            24.0,
            "Fish",
        ),
        (
            M,
            "Bochecha de porco preto",
            "Black pork cheek braised in red wine with creamy polenta.",
            23.5,
            "Sulphites, Milk",
        ),
        (
            M,
            "Polvo com migas",
            "Grilled octopus with Alentejo-style breadcrumbs.",
            27.0,
            "Molluscs, Gluten",
        ),
        (M, "Risotto de gambas", "Prawn risotto with lemon and herbs.", 22.0, "Crustaceans, Milk"),
        (
            D,
            "Cheesecake de goiaba",
            "Cream cheese tart with guava jelly.",
            7.0,
            "Gluten, Milk, Eggs",
        ),
        (D, "Pastel de nata", "Warm custard tart with cinnamon.", 2.5, "Gluten, Milk, Eggs"),
        (B, "Cocktail Miradouro", "Gin, port, orange and rosemary.", 11.0, "Sulphites"),
        (B, "Vinho do Douro (copo)", "Red, by the glass.", 5.5, "Sulphites"),
        (B, "Café", "Espresso.", 1.6, ""),
    ],
    "tasca-do-bairro": [
        (S, "Pastéis de bacalhau (3)", "Salt cod fritters.", 5.0, "Fish, Gluten, Eggs"),
        (
            S,
            "Alheira de Mirandela",
            "Smoked bread-and-poultry sausage with a fried egg.",
            6.5,
            "Gluten, Eggs",
        ),
        (
            S,
            "Ovos mexidos com farinheira",
            "Scrambled eggs with farinheira sausage.",
            6.0,
            "Eggs, Gluten",
        ),
        (S, "Salada de feijão-frade", "Black-eyed bean salad with tuna and onion.", 5.5, "Fish"),
        (M, "Prego no pão", "Steak sandwich with garlic and mustard.", 5.5, "Gluten, Mustard"),
        (M, "Bifana", "Marinated pork sandwich.", 4.5, "Gluten"),
        (M, "Prato do dia", "Soup, main of the day, drink and coffee.", 9.5, "Ask the staff"),
        (
            M,
            "Choco frito",
            "Fried cuttlefish with tartare sauce and chips.",
            11.0,
            "Molluscs, Eggs, Gluten",
        ),
        (D, "Arroz-doce", "Rice pudding with cinnamon.", 3.0, "Milk"),
        (D, "Leite-creme", "Burnt custard.", 3.0, "Milk, Eggs"),
        (B, "Imperial", "Draught beer, 20 cl.", 1.5, "Gluten"),
        (B, "Vinho tinto (jarro)", "House red, half litre.", 7.0, "Sulphites"),
    ],
    # ------------------------------------------------------------------ the Lisbon catalogue
    "cervejaria-ramiro": [
        (S, "Ostras", "Fresh oysters, by the unit.", 3.5, "Molluscs"),
        (
            S,
            "Amêijoas à Bulhão Pato",
            "Clams in garlic, coriander and white wine.",
            24.0,
            "Molluscs, Sulphites",
        ),
        (S, "Gambas ao alho", "Prawns sizzled in garlic and olive oil.", 26.0, "Crustaceans"),
        (S, "Presunto", "A plate of cured ham.", 14.2, ""),
        (
            M,
            "Carabineiros",
            "Giant red prawns, priced by weight, grilled or boiled.",
            85.0,
            "Crustaceans",
        ),
        (M, "Percebes", "Goose barnacles, priced by weight.", 65.0, "Crustaceans"),
        (M, "Sapateira recheada", "Dressed brown crab.", 28.0, "Crustaceans"),
        (M, "Lagosta", "Lobster, priced by weight.", 95.0, "Crustaceans"),
        (M, "Camarão tigre grelhado", "Grilled tiger prawns.", 36.0, "Crustaceans"),
        (D, "Prego no pão", "The house's steak sandwich, eaten last.", 7.5, "Gluten"),
        (D, "Pudim da casa", "Egg pudding.", 5.0, "Eggs, Milk"),
        (B, "Cerveja de pressão", "Draught beer.", 3.0, "Gluten"),
        (B, "Vinho verde (garrafa)", "Chilled white.", 15.0, "Sulphites"),
    ],
    "can-the-can": [
        (
            S,
            "Bolinhos de bacalhau",
            "Salt cod fritters with a tomato jam.",
            8.5,
            "Fish, Gluten, Eggs",
        ),
        (
            S,
            "Tosta de atum",
            "Tinned tuna on toasted bread with pickled red onion.",
            9.0,
            "Fish, Gluten",
        ),
        (
            S,
            "Mexilhão em escabeche",
            "Mussels from the tin, with bread and olives.",
            10.5,
            "Molluscs, Gluten",
        ),
        (S, "Tábua de enchidos e queijos", "A board of cured meats and cheeses.", 16.0, "Milk"),
        (M, "Polvo frito", "Fried octopus with sweet potato.", 19.5, "Molluscs"),
        (M, "Bacalhau à Brás", "Shredded cod, egg and crisp potato.", 17.5, "Fish, Eggs"),
        (
            M,
            "Sardinhas em lata com salada",
            "Premium tinned sardines with a tomato and pepper salad.",
            14.0,
            "Fish",
        ),
        (M, "Choco frito", "Fried cuttlefish with mayonnaise.", 18.0, "Molluscs, Eggs"),
        (D, "Pastel de nata", "Custard tart.", 2.5, "Gluten, Milk, Eggs"),
        (D, "Mousse de chocolate", "Dark chocolate mousse.", 5.5, "Eggs, Milk"),
        (B, "Sangria de vinho verde", "A jug for two.", 17.0, "Sulphites"),
        (B, "Cerveja artesanal", "Local craft beer.", 4.5, "Gluten"),
    ],
    "nori-restaurante": [
        (S, "Edamame", "Steamed soybeans with sea salt.", 4.5, "Soy"),
        (S, "Gyoza (5)", "Pan-fried pork dumplings.", 7.0, "Gluten, Soy"),
        (S, "Sopa de miso", "Miso soup with tofu and seaweed.", 3.5, "Soy, Fish"),
        (
            S,
            "Tempura de camarão",
            "Crisp prawn tempura with dipping sauce.",
            9.0,
            "Crustaceans, Gluten, Eggs",
        ),
        (
            M,
            "Ramen de porco",
            "Pork broth, noodles, egg and spring onion.",
            13.5,
            "Gluten, Soy, Eggs",
        ),
        (
            M,
            "Katsu curry",
            "Breaded pork cutlet with Japanese curry and rice.",
            13.0,
            "Gluten, Eggs",
        ),
        (M, "Yakisoba de legumes", "Stir-fried noodles with vegetables.", 11.5, "Gluten, Soy"),
        (
            M,
            "Sushi misto (12 peças)",
            "Chef's selection of nigiri and maki.",
            18.5,
            "Fish, Soy, Gluten",
        ),
        (D, "Mochi", "Rice cake filled with ice cream.", 5.0, "Milk"),
        (D, "Gelado de chá verde", "Matcha ice cream.", 4.5, "Milk"),
        (B, "Cerveja japonesa", "Asahi, 33 cl.", 3.5, "Gluten"),
        (B, "Chá verde", "A pot of green tea.", 2.5, ""),
    ],
    "epur": [
        (S, "Menu amuse-bouche", "Three small bites to begin.", 18.0, "Ask the staff"),
        (S, "Foie gras com figo", "Seared foie gras with fig and brioche.", 28.0, "Gluten, Eggs"),
        (
            M,
            "Menu de degustação (5 momentos)",
            "Five courses from the chef's season.",
            125.0,
            "Ask the staff",
        ),
        (
            M,
            "Menu de degustação (7 momentos)",
            "Seven courses with the chef's classics.",
            155.0,
            "Ask the staff",
        ),
        (
            M,
            "Pombo, beterraba e cereja",
            "Roast pigeon with beetroot and cherry.",
            48.0,
            "Sulphites",
        ),
        (
            M,
            "Robalo com beurre blanc",
            "Sea bass with a white butter sauce and spring vegetables.",
            46.0,
            "Fish, Milk",
        ),
        (
            D,
            "Soufflé de chocolate",
            "Warm chocolate soufflé with vanilla cream.",
            16.0,
            "Eggs, Milk, Gluten",
        ),
        (D, "Queijos franceses", "A selection of French cheeses.", 18.0, "Milk"),
        (
            B,
            "Harmonização de vinhos (5)",
            "Five wines chosen for the tasting menu.",
            75.0,
            "Sulphites",
        ),
        (B, "Champanhe (taça)", "A glass of champagne.", 16.0, "Sulphites"),
    ],
    "eleven": [
        (S, "Pão e manteiga de algas", "House bread with seaweed butter.", 6.0, "Gluten, Milk"),
        (
            S,
            "Vieiras com couve-flor",
            "Scallops with cauliflower and hazelnut.",
            32.0,
            "Molluscs, Nuts, Milk",
        ),
        (
            M,
            "Menu de degustação (4 pratos)",
            "Four courses, with a vegetarian option.",
            110.0,
            "Ask the staff",
        ),
        (M, "Menu de degustação (6 pratos)", "Six courses.", 145.0, "Ask the staff"),
        (
            M,
            "Cordeiro com ervas",
            "Rack of lamb with herb crust and seasonal vegetables.",
            46.0,
            "Mustard, Gluten",
        ),
        (
            M,
            "Linguado com manteiga noisette",
            "Sole with brown butter and capers.",
            52.0,
            "Fish, Milk",
        ),
        (
            D,
            "Chocolate, avelã e sal",
            "Chocolate with hazelnut and a touch of salt.",
            15.0,
            "Nuts, Milk, Eggs, Gluten",
        ),
        (D, "Frutos vermelhos", "Red berries with a light cream.", 14.0, "Milk"),
        (B, "Harmonização de vinhos", "Wines chosen for the tasting menu.", 85.0, "Sulphites"),
        (B, "Cocktail de assinatura", "The bar's seasonal cocktail.", 14.0, "Sulphites"),
    ],
    "o-faia": [
        (S, "Pastéis de bacalhau", "Salt cod fritters.", 8.0, "Fish, Gluten, Eggs"),
        (S, "Queijo da Serra e presunto", "Serra cheese with cured ham.", 16.0, "Milk"),
        (S, "Caldo verde", "Kale and potato soup with chouriço.", 6.5, ""),
        (M, "Bacalhau com broa", "Cod baked under a cornbread crust.", 24.0, "Fish, Gluten"),
        (M, "Arroz de pato", "Duck rice, baked.", 22.0, "Celery"),
        (M, "Cabrito assado", "Roast kid with potatoes, for two.", 54.0, "Sulphites"),
        (M, "Bife à Faia", "Steak with ham, egg and chips.", 24.0, "Eggs"),
        (
            D,
            "Pudim abade de Priscos",
            "Rich egg pudding with port and bacon.",
            7.5,
            "Eggs, Sulphites",
        ),
        (D, "Toucinho do céu", "Almond and egg-yolk cake.", 6.5, "Nuts, Eggs"),
        (B, "Vinho do Alentejo (garrafa)", "House red.", 22.0, "Sulphites"),
        (B, "Aguardente", "Digestif.", 5.0, "Sulphites"),
    ],
    "cantinho-do-avillez": [
        (S, "Ovo perfeito", "Slow-cooked egg with truffle and cured ham.", 9.5, "Eggs"),
        (
            S,
            "Croquetes de alheira",
            "Alheira sausage croquettes with mustard.",
            8.0,
            "Gluten, Milk, Mustard",
        ),
        (
            S,
            "Salada de polvo e feijão-frade",
            "Octopus and black-eyed bean salad.",
            13.5,
            "Molluscs",
        ),
        (M, "Bife da vazia", "Flank steak with chips and a fried egg.", 19.5, "Eggs"),
        (M, "Arroz de pato desfiado", "Shredded duck rice with chouriço.", 18.5, "Celery"),
        (M, "Bacalhau com grão", "Cod with chickpeas and coriander.", 19.0, "Fish"),
        (
            M,
            "Hambúrguer do Cantinho",
            "House burger with cheese and caramelised onion.",
            15.5,
            "Gluten, Milk, Eggs",
        ),
        (
            D,
            "Bolo de chocolate quente",
            "Warm chocolate cake with vanilla ice cream.",
            8.5,
            "Gluten, Milk, Eggs",
        ),
        (D, "Tarte de limão", "Lemon tart with meringue.", 7.5, "Gluten, Milk, Eggs"),
        (B, "Vinho branco (copo)", "Alentejo white, by the glass.", 5.0, "Sulphites"),
        (B, "Limonada", "Homemade lemonade.", 3.5, ""),
    ],
    "casa-da-india": [
        (S, "Alheira com ovo", "Smoked sausage with a fried egg.", 7.0, "Gluten, Eggs"),
        (S, "Salada de queijo fresco", "Fresh cheese, tomato and olives.", 7.5, "Milk"),
        (S, "Pataniscas de bacalhau", "Salt cod fritters.", 8.0, "Fish, Gluten, Eggs"),
        (M, "Bacalhau à Brás", "Shredded cod, egg and crisp potato.", 14.0, "Fish, Eggs"),
        (M, "Frango de churrasco", "Grilled chicken with piri-piri and chips.", 11.5, ""),
        (M, "Feijoada à portuguesa", "Bean stew with pork and sausages.", 13.0, ""),
        (M, "Carne de porco à alentejana", "Pork with clams and fried potatoes.", 14.5, "Molluscs"),
        (D, "Cheesecake", "House cheesecake with red fruit.", 4.5, "Gluten, Milk, Eggs"),
        (D, "Torta de laranja", "Orange roll cake.", 4.0, "Gluten, Eggs"),
        (B, "Vinho da casa (jarro)", "Red or white, half litre.", 7.5, "Sulphites"),
        (B, "Sumo natural", "Freshly squeezed orange juice.", 3.0, ""),
    ],
    "casa-da-mariquinhas": [
        (S, "Pão, azeitonas e queijo", "To start, as in a Portuguese home.", 4.5, "Gluten, Milk"),
        (S, "Salada de bacalhau", "Cod, chickpeas and egg.", 9.5, "Fish, Eggs"),
        (S, "Caldo verde", "Kale and potato soup.", 5.0, ""),
        (M, "Feijoada de choco", "Cuttlefish and bean stew.", 16.5, "Molluscs"),
        (
            M,
            "Bacalhau à Zé do Pipo",
            "Cod baked under mayonnaise with potato purée.",
            17.5,
            "Fish, Eggs",
        ),
        (M, "Arroz de tamboril", "Monkfish rice with prawns.", 19.0, "Fish, Crustaceans"),
        (M, "Pica-pau", "Beef strips in a spiced sauce with pickles.", 14.5, "Mustard"),
        (D, "Pudim flan", "Caramel custard.", 4.5, "Eggs, Milk"),
        (D, "Arroz-doce", "Rice pudding.", 4.0, "Milk"),
        (B, "Vinho tinto (copo)", "Red, by the glass.", 3.5, "Sulphites"),
        (B, "Ginjinha", "Sour cherry liqueur.", 2.5, "Sulphites"),
    ],
    "come-prima": [
        (S, "Bruschetta al pomodoro", "Tomato, garlic and basil on grilled bread.", 6.5, "Gluten"),
        (S, "Burrata com tomate", "Burrata with ripe tomato and basil.", 11.5, "Milk"),
        (S, "Carpaccio de vitela", "Veal carpaccio with rocket and parmesan.", 12.5, "Milk"),
        (M, "Pizza Margherita", "Tomato, mozzarella and basil.", 10.5, "Gluten, Milk"),
        (M, "Pizza Diavola", "Spicy salami, mozzarella and chilli.", 12.5, "Gluten, Milk"),
        (M, "Pizza Quattro Formaggi", "Four cheeses.", 13.5, "Gluten, Milk"),
        (M, "Spaghetti alla carbonara", "Egg, guanciale and pecorino.", 13.0, "Gluten, Eggs, Milk"),
        (M, "Lasagna della nonna", "Beef ragù, béchamel and parmesan.", 14.0, "Gluten, Milk, Eggs"),
        (D, "Tiramisù", "Mascarpone, coffee and cocoa.", 6.0, "Gluten, Milk, Eggs"),
        (D, "Panna cotta", "With a berry sauce.", 5.5, "Milk"),
        (B, "Vino della casa (copo)", "Italian red or white.", 4.5, "Sulphites"),
        (B, "Aperol Spritz", "Aperol, prosecco and soda.", 7.5, "Sulphites"),
    ],
    "doca-peixe": [
        (S, "Salada de polvo", "Octopus salad with peppers and coriander.", 13.5, "Molluscs"),
        (S, "Amêijoas à Bulhão Pato", "Clams in garlic and coriander.", 16.0, "Molluscs"),
        (S, "Pastéis de bacalhau", "Salt cod fritters.", 6.5, "Fish, Gluten, Eggs"),
        (
            M,
            "Peixe do dia grelhado",
            "Grilled fish of the day, by weight, with potatoes and greens.",
            28.0,
            "Fish",
        ),
        (
            M,
            "Cataplana de marisco",
            "Shellfish cooked with tomato and peppers, for two.",
            55.0,
            "Crustaceans, Molluscs",
        ),
        (M, "Arroz de marisco", "Seafood rice.", 24.0, "Crustaceans, Molluscs"),
        (M, "Lulas grelhadas", "Grilled squid.", 18.5, "Molluscs"),
        (M, "Bacalhau à lagareiro", "Cod with roast potatoes and olive oil.", 19.5, "Fish"),
        (D, "Pudim de laranja", "Orange pudding.", 5.0, "Eggs, Milk"),
        (D, "Salada de frutas", "Fresh fruit.", 4.5, ""),
        (B, "Vinho verde (garrafa)", "Chilled white.", 14.0, "Sulphites"),
        (B, "Sangria (jarro)", "White sangria.", 15.0, "Sulphites"),
    ],
    "cafe-principe-real": [
        (S, "Tosta mista", "Ham and cheese on toasted bread.", 6.5, "Gluten, Milk"),
        (S, "Sopa do dia", "Soup of the day.", 5.5, ""),
        (
            S,
            "Salada Príncipe Real",
            "Mixed leaves, goat cheese, pear and walnuts.",
            11.5,
            "Milk, Nuts",
        ),
        (
            M,
            "Hambúrguer de novilho",
            "Beef burger with cheddar and chips.",
            16.5,
            "Gluten, Milk, Eggs",
        ),
        (M, "Bacalhau com natas", "Creamy baked cod.", 17.5, "Fish, Milk, Gluten"),
        (M, "Risotto de cogumelos", "Mushroom risotto.", 15.0, "Milk"),
        (M, "Salmão grelhado", "Grilled salmon with sautéed vegetables.", 18.5, "Fish"),
        (D, "Pastel de nata", "Custard tart.", 2.5, "Gluten, Milk, Eggs"),
        (D, "Bolo de bolacha", "Biscuit and coffee cake.", 5.0, "Gluten, Milk, Eggs"),
        (B, "Galão", "Milky coffee, in a tall glass.", 2.2, "Milk"),
        (B, "Sumo de laranja", "Freshly squeezed.", 3.8, ""),
        (B, "Gin tónico", "Served with a slice of orange.", 9.0, ""),
    ],
    "figus": [
        (S, "Salada de polvo", "Octopus with chickpeas.", 10.5, "Molluscs"),
        (S, "Peixinhos da horta", "Battered green beans.", 7.0, "Gluten, Eggs"),
        (S, "Queijo de ovelha", "Sheep's cheese with quince jelly.", 9.0, "Milk"),
        (M, "Bacalhau com natas", "Cod baked with cream and potatoes.", 16.5, "Fish, Milk, Gluten"),
        (M, "Arroz de pato", "Duck rice.", 15.5, "Celery"),
        (M, "Alheira com grelos", "Smoked sausage with turnip greens.", 14.0, "Gluten"),
        (M, "Bife à portuguesa", "Steak with a fried egg and ham.", 17.0, "Eggs"),
        (D, "Pudim de ovos", "Egg pudding.", 4.5, "Eggs, Milk"),
        (D, "Molotov", "Light meringue with egg-thread sauce.", 5.0, "Eggs"),
        (B, "Vinho da casa (copo)", "Red or white.", 3.8, "Sulphites"),
        (B, "Café", "Espresso.", 1.3, ""),
    ],
    "cervejaria-trindade": [
        (S, "Ameijoas à Bulhão Pato", "Clams in garlic and coriander.", 19.0, "Molluscs"),
        (S, "Mexilhão ao vapor", "Steamed mussels.", 12.0, "Molluscs"),
        (S, "Presunto e queijo", "Ham and cheese board.", 13.5, "Milk"),
        (M, "Arroz de marisco", "Seafood rice.", 26.0, "Crustaceans, Molluscs"),
        (M, "Camarão tigre", "Tiger prawns, by weight.", 38.0, "Crustaceans"),
        (M, "Bife à Trindade", "Steak with a rich house sauce and chips.", 19.5, "Milk, Eggs"),
        (M, "Bacalhau à Brás", "Shredded cod, egg and potato.", 16.5, "Fish, Eggs"),
        (D, "Pudim de ovos", "Egg pudding.", 5.0, "Eggs, Milk"),
        (D, "Tarte de amêndoa", "Almond tart.", 5.5, "Nuts, Eggs, Gluten"),
        (B, "Cerveja Trindade (caneca)", "House draught beer.", 3.2, "Gluten"),
        (B, "Vinho verde (garrafa)", "Chilled white.", 15.0, "Sulphites"),
    ],
    "o-pinoquio": [
        (S, "Camarão cozido", "Boiled prawns.", 16.0, "Crustaceans"),
        (S, "Amêijoas à Bulhão Pato", "Clams in garlic and coriander.", 18.0, "Molluscs"),
        (S, "Sopa de peixe", "Fish soup.", 6.5, "Fish, Gluten"),
        (M, "Arroz de tamboril", "Monkfish rice.", 24.0, "Fish, Crustaceans"),
        (M, "Bacalhau à Pinóquio", "Cod with cream, spinach and cheese.", 19.5, "Fish, Milk"),
        (M, "Linguado grelhado", "Grilled sole with boiled potatoes.", 29.0, "Fish"),
        (M, "Bife grelhado", "Grilled steak with chips.", 18.0, "Milk"),
        (D, "Mousse de chocolate", "Chocolate mousse.", 5.0, "Eggs, Milk"),
        (D, "Tarte de maçã", "Apple tart.", 5.0, "Gluten, Eggs, Milk"),
        (B, "Vinho branco (garrafa)", "Douro white.", 16.0, "Sulphites"),
        (B, "Imperial", "Draught beer.", 2.0, "Gluten"),
    ],
    "gambrinus": [
        (S, "Sopa de marisco", "Shellfish soup.", 14.0, "Crustaceans, Molluscs"),
        (S, "Ostras", "Fresh oysters, by the unit.", 4.5, "Molluscs"),
        (S, "Ovos mexidos com trufa", "Scrambled eggs with truffle.", 18.0, "Eggs"),
        (M, "Lagosta à Gambrinus", "Lobster in the house sauce.", 98.0, "Crustaceans, Milk"),
        (M, "Linguado meunière", "Sole with brown butter and lemon.", 48.0, "Fish, Milk"),
        (M, "Bife Gambrinus", "Fillet steak with a rich sauce.", 38.0, "Milk"),
        (M, "Arroz de marisco", "Seafood rice.", 36.0, "Crustaceans, Molluscs"),
        (D, "Crepe Suzette", "Flambéed pancake with orange.", 14.0, "Gluten, Eggs, Milk"),
        (D, "Mousse de chocolate", "Dark chocolate mousse.", 9.0, "Eggs, Milk"),
        (B, "Vinho do Porto (cálice)", "A glass of tawny port.", 8.0, "Sulphites"),
        (B, "Champanhe (taça)", "A glass of champagne.", 14.0, "Sulphites"),
    ],
    "solar-dos-presuntos": [
        (S, "Presunto de Chaves", "Cured ham, sliced by hand.", 19.5, ""),
        (S, "Salada de polvo", "Octopus salad.", 13.0, "Molluscs"),
        (S, "Queijo de Azeitão", "Soft sheep's cheese.", 9.5, "Milk"),
        (
            M,
            "Arroz de tamboril com gambas",
            "Monkfish rice with prawns.",
            26.0,
            "Fish, Crustaceans",
        ),
        (M, "Bacalhau Solar", "Cod baked with sautéed onion and potato.", 21.0, "Fish"),
        (M, "Cabrito assado", "Roast kid with potatoes.", 25.0, "Sulphites"),
        (M, "Vitela de lavoura", "Farm-raised veal with roast potatoes.", 24.0, ""),
        (D, "Pudim Abade de Priscos", "Rich egg pudding.", 7.0, "Eggs, Sulphites"),
        (D, "Tarte de nozes", "Walnut tart.", 6.0, "Nuts, Gluten, Eggs"),
        (B, "Vinho do Douro (garrafa)", "Red.", 24.0, "Sulphites"),
        (B, "Aguardente velha", "Aged brandy.", 6.0, "Sulphites"),
    ],
    "martinho-da-arcada": [
        (S, "Sopa do dia", "Soup of the day.", 5.5, ""),
        (S, "Pastéis de bacalhau", "Salt cod fritters.", 9.0, "Fish, Gluten, Eggs"),
        (
            M,
            "Bife à Martinho",
            "Beef loin with a cream and coffee sauce, served with Portuguese-style fried potatoes.",
            24.0,
            "Milk",
        ),
        (
            M,
            "Espetada à ribatejana",
            "Grilled loin skewer with fried potatoes and salad.",
            22.0,
            "",
        ),
        (
            M,
            "Bacalhau à Martinho",
            "Fried Icelandic cod with olive oil and onions, with fried potatoes.",
            22.5,
            "Fish",
        ),
        (
            M,
            "Bacalhau à Lagareiro",
            "Grilled cod with oven-roasted potatoes, hot garlic olive oil and seasonal vegetables.",
            23.5,
            "Fish",
        ),
        (
            M,
            "Medalhões de veado",
            "Fried venison medallions with a cream and coffee sauce, wedge potatoes and vegetables.",
            27.5,
            "Milk",
        ),
        (
            M,
            "Sardinhas assadas",
            "Roast sardines with boiled potatoes and a lettuce and pepper salad.",
            16.5,
            "Fish",
        ),
        (D, "Pudim de ovos", "Egg pudding.", 5.0, "Eggs, Milk"),
        (D, "Tarte de amêndoa", "Almond tart.", 5.5, "Nuts, Eggs, Gluten"),
        (B, "Vinho tinto da casa (copo)", "Red, by the glass.", 4.5, "Sulphites"),
        (B, "Café", "Espresso.", 1.5, ""),
    ],
    "lisboa-a-noite": [
        (S, "Sopa de peixe", "Fish soup.", 6.5, "Fish, Gluten"),
        (S, "Pataniscas de bacalhau", "Salt cod fritters.", 8.5, "Fish, Gluten, Eggs"),
        (S, "Queijo e enchidos", "Cheese and cured sausage.", 12.0, "Milk"),
        (M, "Polvo à lagareiro", "Roast octopus with olive oil and potatoes.", 24.0, "Molluscs"),
        (
            M,
            "Cataplana de peixe",
            "Fish and shellfish cataplana, for two.",
            46.0,
            "Fish, Crustaceans, Molluscs",
        ),
        (M, "Arroz de marisco", "Seafood rice.", 22.0, "Crustaceans, Molluscs"),
        (M, "Bife à casa", "House steak with an egg and chips.", 19.5, "Eggs"),
        (D, "Pudim de ovos", "Egg pudding.", 5.0, "Eggs, Milk"),
        (D, "Sericaia", "Cinnamon sponge with plum.", 5.5, "Eggs, Milk, Gluten"),
        (B, "Vinho tinto (garrafa)", "Alentejo red.", 18.0, "Sulphites"),
        (B, "Ginjinha", "Sour cherry liqueur.", 3.0, "Sulphites"),
    ],
    "casa-do-alentejo": [
        (
            S,
            "Migas à alentejana",
            "Breadcrumbs with garlic and coriander, with pork.",
            8.5,
            "Gluten",
        ),
        (S, "Queijo de Serpa", "Cured sheep's cheese with olives.", 9.0, "Milk"),
        (S, "Presunto de porco preto", "Black pork ham.", 16.0, ""),
        (
            M,
            "Açorda alentejana",
            "Bread soup with garlic, coriander and poached egg.",
            12.0,
            "Gluten, Eggs",
        ),
        (M, "Ensopado de borrego", "Lamb stew over bread.", 16.5, "Gluten"),
        (M, "Carne de porco à alentejana", "Pork with clams and fried potatoes.", 15.5, "Molluscs"),
        (
            M,
            "Bochechas de porco preto",
            "Black pork cheeks braised in red wine.",
            17.5,
            "Sulphites",
        ),
        (D, "Sericaia com ameixa", "Cinnamon sponge with Elvas plum.", 5.5, "Eggs, Milk, Gluten"),
        (D, "Pão de rala", "Sweet almond and pumpkin cake.", 5.0, "Nuts, Eggs"),
        (B, "Vinho do Alentejo (copo)", "Red or white, by the glass.", 4.0, "Sulphites"),
        (B, "Água das Pedras", "Sparkling water.", 2.2, ""),
    ],
    "casa-guedes": [
        (S, "Pica-pau", "Beef strips in a spiced sauce.", 8.5, "Mustard"),
        (S, "Salada de polvo", "Octopus salad.", 9.5, "Molluscs"),
        (S, "Queijo da Serra", "Soft cheese with bread.", 7.0, "Milk, Gluten"),
        (
            M,
            "Sande de pernil com queijo da serra",
            "Slow-roast pork leg sandwich with Serra cheese, the house classic.",
            5.5,
            "Gluten, Milk",
        ),
        (M, "Sande de pernil", "Slow-roast pork leg sandwich.", 4.5, "Gluten"),
        (M, "Bifana", "Marinated pork sandwich.", 4.0, "Gluten"),
        (M, "Prato do dia", "Main of the day with a drink.", 9.0, "Ask the staff"),
        (D, "Arroz-doce", "Rice pudding.", 3.0, "Milk"),
        (B, "Imperial", "Draught beer.", 1.6, "Gluten"),
        (B, "Vinho tinto (copo)", "Red, by the glass.", 2.5, "Sulphites"),
    ],
}


# The 15 Porto restaurants (app.seed.porto_catalogue).
MENUS.update(PORTO_MENUS)


def _items(rows: list[Item]) -> list[dict[str, object]]:
    return [
        {
            "name": name,
            "category": category,
            "description": description,
            "price_cents": round(price * 100),
            "allergens": allergens,
            "available": True,
        }
        for category, name, description, price, allergens in rows
    ]


def seed(session: Session) -> tuple[int, int]:
    """Fill every demo restaurant whose menu is empty. Returns (menus written, restaurants not found)."""
    written = missing = 0
    for slug, rows in MENUS.items():
        venue = session.scalar(select(Venue).where(Venue.slug == slug, Venue.kind == "restaurant"))
        if venue is None:
            missing += 1
            continue
        menu = session.get(RestaurantMenu, venue.id)
        if menu is not None and menu.items:
            continue
        if menu is None:
            session.add(RestaurantMenu(venue_id=venue.id, version=1, items=_items(rows)))
        else:
            menu.items = _items(rows)
            menu.version += 1
        written += 1
    return written, missing


def main(argv: list[str]) -> None:
    settings = get_settings()
    remote = "--allow-remote" in argv
    if not settings.demo_mode or (settings.is_postgres and not remote):
        raise SystemExit(
            "Use DEMO_MODE=1 with a local SQLite demo database, or add --allow-remote for the shared demo database."
        )
    db.init_engine(settings.database_url)
    db.create_all()
    with db.new_session() as session:
        written, missing = seed(session)
        session.commit()
    print(f"Sample menus: {written} written, {missing} restaurants not in this database.")


if __name__ == "__main__":
    main(sys.argv[1:])
