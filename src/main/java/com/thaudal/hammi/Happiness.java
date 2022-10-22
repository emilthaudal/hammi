package com.thaudal.hammi;

public class Happiness {
    private Food food;
    private Play play;
    private Sleep sleep;

    public Happiness() {
        food = new Food();
        play = new Play();
        sleep = new Sleep();
    }
}
