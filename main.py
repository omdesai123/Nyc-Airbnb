from fastapi import FastAPI
import pandas as pd
from pydantic import BaseModel,Field
import joblib
from fastapi.middleware.cors import CORSMiddleware


app=FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


model=joblib.load('Model_pipline.pkl')

COLUMNS=['neighbourhood_group', 'neighbourhood', 'latitude', 'longitude',
       'room_type', 'price', 'minimum_nights', 'number_of_reviews',
       'reviews_per_month', 'calculated_host_listings_count',
       'availability_365']

class Features(BaseModel):
    latitude: float=Field(...,gt=-90,le=90,description='The latitude contain of  a -90 t0 90'),
    longitude: float=Field(...,gt=-180,le=180,description="THe longitude contain of -180 to 180"),
    price: float = Field(..., gt=0, description="Price per night, must be positive")
    minimum_nights: int = Field(..., ge=1, le=365, description="Minimum nights required for booking")
    number_of_reviews: int = Field(..., ge=0, description="Total number of reviews")
    reviews_per_month: float = Field(..., ge=0, description="Average reviews per month")
    calculated_host_listings_count: int = Field(..., ge=0, description="Number of listings by this host")
    availability_365: int = Field(..., ge=0, le=365, description="Days available out of 365")
    neighbourhood_group: str = Field(..., min_length=1, description="Borough or neighbourhood group")
    neighbourhood: str = Field(..., min_length=1, description="Specific neighbourhood name")
    

@app.get('/')
def greet():
    return 'Hello guys'
@app.post('/predict')
def predict(features:Features):
    row = pd.DataFrame([features.model_dump()], columns=COLUMNS)
    prediction=model.predict(row)
    probability=model.predict_proba(row)
    
    return{
        'predicted_room_type':prediction[0],
         "Probability": probability.tolist()[0]}
    