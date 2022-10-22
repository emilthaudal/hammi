package com.thaudal.hammi;

public class Pet {
    private String name;
    private PetType type;
    private Happiness happiness;
    private int daysOld;

    public Pet(String name, PetType type) {
        this.name = name;
        this.type = type;
        happiness = new Happiness();
        daysOld = 0;
    }
    public Pet(String name, PetType type, Happiness happiness, int age) {
        this.name = name;
        this.type = type;
        this.happiness = happiness;
        daysOld = age;
    }

}
